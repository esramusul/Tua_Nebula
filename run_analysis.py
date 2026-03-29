import sys
import heapq
import torch
import numpy as np
import cv2
from PIL import Image
import matplotlib.pyplot as plt
from tqdm import tqdm
import segmentation_models_pytorch as smp

# =========================================================
# 1. AYARLAR
# =========================================================
TEST_IMAGE_PATH = "test3.jpeg"
MODEL_PATH = "best_ultimate_model.pth"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

PATCH_SIZE = 256
STRIDE = 200

ROAD_CLASS = 1
RISK_CLASS = 3
BLOCKED_CLASS = 4

MAX_RADIUS = 2000
ROUTE_DOWNSCALE = 8
FIG_DPI = 300

USE_INTERACTIVE_POINTS = True

# Interactive kapalıysa kullanılacak yaklaşık noktalar
RAW_START = (11800, 120)
RAW_GOAL = (11700, 6900)


# =========================================================
# 2. COST MAP
# =========================================================
def create_cost_map(mask: np.ndarray, mode: str = "safe") -> np.ndarray:
    cost = np.full(mask.shape, 999999.0, dtype=np.float32)

    # Yol her iki modda da en ucuz
    cost[mask == ROAD_CLASS] = 1.0

    if mode == "short":
        # En kısa yol: yıkıklığa bakma, enkazdan geç
        cost[mask == 2] = 1.5          # yıkık_yol - neredeyse yol gibi
        cost[mask == RISK_CLASS] = 2.0 # yıkık_bina - enkaz, geçilebilir
        cost[mask == 0] = 3.0          # açık arazi
        cost[mask == BLOCKED_CLASS] = 999999.0  # sağlam bina - geçilemez
    else:
        # En güvenli yol: yıkıklıktan kaç
        cost[mask == RISK_CLASS] = 8.0
        cost[mask == 0] = 10.0
        cost[mask == 2] = 8.0
        cost[mask == BLOCKED_CLASS] = 999999.0

    return cost


# =========================================================
# 3. A*
# =========================================================
def heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def astar(cost_map: np.ndarray, start: tuple[int, int], goal: tuple[int, int]):
    h, w = cost_map.shape

    neighbors = [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (-1, 1), (1, -1), (1, 1)
    ]

    open_heap = []
    heapq.heappush(open_heap, (0.0, start))

    came_from = {}
    g_score = {start: 0.0}
    visited = set()

    while open_heap:
        _, current = heapq.heappop(open_heap)

        if current in visited:
            continue
        visited.add(current)

        if current == goal:
            path = []
            node = current
            while node in came_from:
                path.append(node)
                node = came_from[node]
            path.append(start)
            path.reverse()
            return path

        for dr, dc in neighbors:
            nr = current[0] + dr
            nc = current[1] + dc

            if not (0 <= nr < h and 0 <= nc < w):
                continue

            if cost_map[nr, nc] >= 999999:
                continue

            step_cost = cost_map[nr, nc]
            if dr != 0 and dc != 0:
                step_cost *= 1.414

            tentative_g = g_score[current] + step_cost

            if (nr, nc) not in g_score or tentative_g < g_score[(nr, nc)]:
                came_from[(nr, nc)] = current
                g_score[(nr, nc)] = tentative_g
                f_score = tentative_g + heuristic((nr, nc), goal)
                heapq.heappush(open_heap, (f_score, (nr, nc)))

    return None


# =========================================================
# 4. EN YAKIN YOL BUL
# =========================================================
def find_nearest_road(
    mask: np.ndarray,
    point: tuple[int, int],
    road_class: int = ROAD_CLASS,
    max_radius: int = MAX_RADIUS,
):
    x, y = point
    h, w = mask.shape

    if not (0 <= x < h and 0 <= y < w):
        return None

    if mask[x, y] == road_class:
        return (x, y)

    best_point = None
    best_dist = float("inf")

    for r in range(max_radius + 1):
        x_min = max(0, x - r)
        x_max = min(h, x + r + 1)
        y_min = max(0, y - r)
        y_max = min(w, y + r + 1)

        for nx in range(x_min, x_max):
            for ny in range(y_min, y_max):
                if mask[nx, ny] == road_class:
                    dist = abs(nx - x) + abs(ny - y)
                    if dist < best_dist:
                        best_dist = dist
                        best_point = (nx, ny)

        if best_point is not None:
            return best_point

    return None


# =========================================================
# 5. KÜÇÜLTME / KOORDİNAT DÖNÜŞÜMÜ
# =========================================================
def downsample_mask(mask: np.ndarray, scale: int) -> np.ndarray:
    h, w = mask.shape
    small_h = max(1, h // scale)
    small_w = max(1, w // scale)

    return cv2.resize(
        mask.astype(np.uint8),
        (small_w, small_h),
        interpolation=cv2.INTER_NEAREST
    )


def scale_point_down(point: tuple[int, int], scale: int) -> tuple[int, int]:
    return (point[0] // scale, point[1] // scale)


def scale_path_up(path, scale: int):
    if path is None:
        return None
    return [(p[0] * scale, p[1] * scale) for p in path]


# =========================================================
# 6. INTERAKTİF TIKLAMA
# =========================================================
def pick_points_from_image(full_img_np: np.ndarray):
    print("Resimde önce BAŞLANGIÇ, sonra HEDEF noktasına tıkla.")
    plt.figure(figsize=(8, 12))
    plt.imshow(full_img_np)
    plt.title("Önce başlangıç, sonra hedef için tıkla")
    plt.axis("on")

    pts = plt.ginput(2, timeout=0)
    plt.close()

    if len(pts) != 2:
        raise ValueError("İki nokta seçilmedi.")

    start = (int(pts[0][1]), int(pts[0][0]))
    goal = (int(pts[1][1]), int(pts[1][0]))
    return start, goal


# =========================================================
# 7. SEGMENTASYON
# =========================================================
def run_segmentation(model, full_img_np: np.ndarray) -> np.ndarray:
    h, w, _ = full_img_np.shape
    full_mask = np.zeros((h, w), dtype=np.uint8)

    print("🔬 Segmentasyon başlıyor...")
    for i in tqdm(range(0, h - PATCH_SIZE, STRIDE), desc="Satırlar"):
        for j in range(0, w - PATCH_SIZE, STRIDE):
            patch = full_img_np[i:i + PATCH_SIZE, j:j + PATCH_SIZE]

            input_tensor = torch.from_numpy(patch).permute(2, 0, 1).float() / 255.0
            input_tensor = input_tensor.unsqueeze(0).to(DEVICE)

            with torch.no_grad():
                output = model(input_tensor)
                pred_patch = torch.argmax(output, dim=1).cpu().numpy()[0]

            full_mask[i:i + PATCH_SIZE, j:j + PATCH_SIZE] = pred_patch

    print("✅ Segmentasyon tamamlandı.")
    return full_mask


# =========================================================
# 8. GÖRSELLEŞTİRME
# =========================================================
def plot_results(full_img_np, full_mask, raw_start, raw_goal, short_path, safe_path):
    plt.figure(figsize=(18, 8))

    # SOL: sadece orijinal görüntü + start/goal + rota
    plt.subplot(1, 2, 1)
    plt.imshow(full_img_np)
    plt.title("Orijinal Görüntü Üzerinde Rotalar")
    plt.axis("off")

    # Güvenli rotayı önce kalın yeşil çiziyoruz (Alt katman)
    if safe_path is not None:
        xs = [p[1] for p in safe_path]
        ys = [p[0] for p in safe_path]
        plt.plot(xs, ys, color='#10b981', linewidth=7, alpha=0.6, label="En Güvenli Rota")

    # Kısa rotayı ince kesikli sarı/turuncu çiziyoruz (Üst katman)
    # Böylece iki rota aynı olsa bile birbirini gizlemeyecek!
    if short_path is not None:
        xs = [p[1] for p in short_path]
        ys = [p[0] for p in short_path]
        plt.plot(xs, ys, color='#f59e0b', linestyle='--', linewidth=3, label="En Kısa Rota")

    plt.scatter(raw_start[1], raw_start[0], color='#22d3ee', s=250, marker="X", edgecolors='black', linewidths=2, zorder=5, label="Başlangıç")
    plt.scatter(raw_goal[1], raw_goal[0], color='#10b981', s=250, marker="X", edgecolors='black', linewidths=2, zorder=5, label="Hedef")
    plt.legend()

    # SAĞ: sadece maske
    plt.subplot(1, 2, 2)
    plt.imshow(full_mask, cmap="jet")
    plt.title("Segmentasyon Maskesi")
    plt.axis("off")

    plt.tight_layout()
    plt.savefig("final_routes_overlay.png", dpi=FIG_DPI, bbox_inches="tight")
    plt.show()

    plt.figure(figsize=(8, 8))
    plt.imshow(full_mask, cmap="jet")
    plt.colorbar()
    plt.title("Segmentasyon Maskesi")
    plt.axis("off")
    plt.tight_layout()
    plt.savefig("segmentation_mask.png", dpi=FIG_DPI, bbox_inches="tight")
    plt.close()


# =========================================================
# 9. ANA AKIŞ
# =========================================================
def main():
    print(f"Device: {DEVICE}")

    print("📦 Model yükleniyor...")
    model = smp.Unet(encoder_name="resnet34", classes=5).to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()

    print("🖼️ Görüntü açılıyor...")
    Image.MAX_IMAGE_PIXELS = None
    full_img = Image.open(TEST_IMAGE_PATH).convert("RGB")
    full_img_np = np.array(full_img)

    h, w, _ = full_img_np.shape
    print(f"Görüntü boyutu: {h} x {w}")

    if USE_INTERACTIVE_POINTS:
        raw_start, raw_goal = pick_points_from_image(full_img_np)
    else:
        raw_start, raw_goal = RAW_START, RAW_GOAL

    print("Ham başlangıç:", raw_start)
    print("Ham hedef    :", raw_goal)

    full_mask = run_segmentation(model, full_img_np)

    print("Unique classes:", np.unique(full_mask))
    print("Road pixel count   :", int(np.sum(full_mask == ROAD_CLASS)))
    print("Risk pixel count   :", int(np.sum(full_mask == RISK_CLASS)))
    print("Blocked pixel count:", int(np.sum(full_mask == BLOCKED_CLASS)))

    # Ham noktaları yola oturt
    start = find_nearest_road(full_mask, raw_start, max_radius=MAX_RADIUS)
    goal = find_nearest_road(full_mask, raw_goal, max_radius=MAX_RADIUS)

    print("Yola taşınmış start:", start)
    print("Yola taşınmış goal :", goal)

    if start is None or goal is None:
        raise ValueError("Başlangıç veya hedef için uygun yol pikseli bulunamadı.")

    print(f"📉 Maske küçültülüyor... scale={ROUTE_DOWNSCALE}")
    small_mask = downsample_mask(full_mask, ROUTE_DOWNSCALE)

    # yol kalınlaştırma
    road_binary = (small_mask == ROAD_CLASS).astype(np.uint8)
    road_binary = cv2.dilate(road_binary, np.ones((3, 3), np.uint8), iterations=1)
    small_mask[road_binary == 1] = ROAD_CLASS

    small_start = scale_point_down(start, ROUTE_DOWNSCALE)
    small_goal = scale_point_down(goal, ROUTE_DOWNSCALE)

    small_start = find_nearest_road(small_mask, small_start, max_radius=300)
    small_goal = find_nearest_road(small_mask, small_goal, max_radius=300)

    print("Small start:", small_start)
    print("Small goal :", small_goal)

    if small_start is None or small_goal is None:
        raise ValueError("Küçültülmüş maskede start/goal yol üstüne oturtulamadı.")

    print("🗺️ Cost map oluşturuluyor...")
    short_cost_map = create_cost_map(small_mask, mode="short")
    safe_cost_map = create_cost_map(small_mask, mode="safe")

    print("📍 En kısa rota hesaplanıyor...")
    short_path_small = astar(short_cost_map, small_start, small_goal)

    print("🛡️ En güvenli rota hesaplanıyor...")
    safe_path_small = astar(safe_cost_map, small_start, small_goal)

    print("En kısa rota bulundu mu?:", short_path_small is not None)
    print("En güvenli rota bulundu mu?:", safe_path_small is not None)

    short_path = scale_path_up(short_path_small, ROUTE_DOWNSCALE)
    safe_path = scale_path_up(safe_path_small, ROUTE_DOWNSCALE)

    plot_results(full_img_np, full_mask, raw_start, raw_goal, short_path, safe_path)

    print("✅ Bitti!")
    print("Kaydedilen dosyalar:")
    print("- final_routes_overlay.png")
    print("- segmentation_mask.png")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("\n❌ HATA OLUŞTU:")
        print(e)
        sys.exit(1)