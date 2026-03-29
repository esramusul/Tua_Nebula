import os
import json
import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import segmentation_models_pytorch as smp
from PIL import Image, ImageDraw
import matplotlib.pyplot as plt
from tqdm import tqdm

# --- AYARLAR VE SINIFLAR ---
# LabelMe'deki etiketlerinle birebir aynı olmalı
CLASS_MAP = {
    "yol": 1, 
    "yıkık_yol": 2, 
    "yıkık_bina": 3, 
    "saglam_bina": 4
}
NUM_CLASSES = 5 # 0 (Arkaplan) + 4 Sınıf
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
Image.MAX_IMAGE_PIXELS = None 

# --- DATASET SINIFI (BEYİN) ---
class DisasterDataset(Dataset):
    def __init__(self, imgs, masks):
        self.imgs, self.masks = imgs, masks
    def __len__(self): return len(self.imgs)
    def __getitem__(self, idx):
        # Görüntüyü Tensor'a çevir (C, H, W) ve 0-1 arasına çek
        img = torch.from_numpy(self.imgs[idx]).permute(2,0,1).float() / 255.0
        # Maskeyi Long tipinde Tensor'a çevir
        mask = torch.from_numpy(self.masks[idx]).long()
        return img, mask

# --- ÜÇLÜ VERİ SETİ BİRLEŞTİRME FONKSİYONU ---
def get_ultimate_patches(patch_size=256, stride=256):
    patches_img, patches_mask = [], []
    
    # Eşleşen dosyalar (after, test2, test3)
    pairs = [
        ('after.jpeg', 'etiketler.json'),
        ('test2.jpeg', '2.json'),
        ('test3.jpeg', '3.json')
    ]
    
    print("📡 Dev uydu fotoğrafları işleniyor (Bu işlem 2-3 dk sürebilir)...")
    
    for img_name, json_name in pairs:
        img_path = f"/content/{img_name}"
        json_path = f"/content/{json_name}"
        
        if not os.path.exists(img_path) or not os.path.exists(json_path):
            print(f"⚠️ Eksik Dosya: {img_name} veya {json_name} bulunamadı, atlanıyor.")
            continue
            
        # Görüntüyü Oku
        full_img = cv2.imread(img_path)
        full_img = cv2.cvtColor(full_img, cv2.COLOR_BGR2RGB)
        h, w, _ = full_img.shape
        
        # Maskeyi Boş Oluştur
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # JSON'dan Maskeyi Çiz
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        for shape in data['shapes']:
            label = shape['label']
            if label in CLASS_MAP:
                class_id = CLASS_MAP[label]
                # PIL ile maskeyi çizip numpy'a aktar
                img_mask = Image.new('L', (w, h), 0)
                ImageDraw.Draw(img_mask).polygon([tuple(p) for p in shape['points']], outline=1, fill=1)
                mask[np.array(img_mask) == 1] = class_id
        
        # Parçalara Böl (Patching)
        for i in range(0, h-patch_size, stride):
            for j in range(0, w-patch_size, stride):
                p_img = full_img[i:i+patch_size, j:j+patch_size]
                p_mask = mask[i:i+patch_size, j:j+patch_size]
                
                # Sadece etiketlenmiş alan içeren parçaları al (Boş tarlaları eğitime katma)
                if np.any(p_mask > 0):
                    patches_img.append(p_img)
                    patches_mask.append(p_mask)
            
    return np.array(patches_img), np.array(patches_mask)

# --- EĞİTİM KURULUMU VE BAŞLATMA ---
if __name__ == "__main__":
    try:
        imgs, masks = get_ultimate_patches()
        print(f"🔥 TOPLAM {len(imgs)} ANLAMLI PARÇA OLUŞTURULDU.")
        
        dataset = DisasterDataset(imgs, masks)
        loader = DataLoader(dataset, batch_size=16, shuffle=True)

        # Mimari: ResNet34 tabanlı U-Net
        model = smp.Unet(encoder_name="resnet34", classes=NUM_CLASSES, encoder_weights="imagenet").to(DEVICE)
        
        optimizer = torch.optim.Adam(model.parameters(), lr=0.0001)
        criterion = smp.losses.DiceLoss(mode='multiclass')

        print(f"🚀 {NUM_CLASSES} sınıflı derin eğitim başlıyor (after + test2 + test3)...")

        # --- EĞİTİM DÖNGÜSÜ (30 Epoch - Aşırı Öğrenmeyi Önlemek İçin) ---
        for epoch in range(30):
            model.train()
            total_loss = 0
            for x, y in loader:
                x, y = x.to(DEVICE), y.to(DEVICE)
                optimizer.zero_grad()
                output = model(x)
                loss = criterion(output, y)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            
            if epoch % 5 == 0:
                print(f"🌟 Epoch {epoch:02d} | Kayıp (Loss): {total_loss/len(loader):.4f}")

        # Modeli Kaydet
        torch.save(model.state_dict(), "best_ultimate_model.pth")
        print("\n🏆 ŞAMPİYON MODEL KAYDEDİLDİ: best_ultimate_model.pth")

    except Exception as e:
        print(f"❌ Bir hata oluştu: {e}")
