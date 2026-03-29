import os
import base64
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import matplotlib.pyplot as plt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    start_x: int = Form(...),
    start_y: int = Form(...),
    goal_x: int = Form(...),
    goal_y: int = Form(...)
):
    temp_image_path = "temp_uploaded_image.jpeg"
    with open(temp_image_path, "wb") as buffer:
        buffer.write(await image.read())

    import run_analysis
    
    # Matplotlib'in arayüzü kitlemesini (block) önlemek için mockluyoruz.
    original_show = plt.show
    plt.show = lambda: None

    run_analysis.TEST_IMAGE_PATH = temp_image_path
    run_analysis.USE_INTERACTIVE_POINTS = False
    
    # Orijinal script (y, x) koordinat dizilişinde kullanıyor
    run_analysis.RAW_START = (start_y, start_x)
    run_analysis.RAW_GOAL = (goal_y, goal_x)

    try:
        run_analysis.main()
    except Exception as e:
        plt.show = original_show
        return JSONResponse(status_code=500, content={"error": str(e)})
        
    plt.show = original_show

    # Orijinal dosyanın bilgisayara kaydettiği resimleri base64 olarak okuyup frontend'e yolluyoruz
    try:
        with open("final_routes_overlay.png", "rb") as f:
            overlay_b64 = base64.b64encode(f.read()).decode("utf-8")
            
        with open("segmentation_mask.png", "rb") as f:
            mask_b64 = base64.b64encode(f.read()).decode("utf-8")
    except FileNotFoundError as e:
        return JSONResponse(status_code=500, content={"error": f"Sonuç dosyası bulunamadı: {str(e)}"})

    return {
        "success": True,
        "overlay": f"data:image/png;base64,{overlay_b64}",
        "mask": f"data:image/png;base64,{mask_b64}"
    }

if __name__ == "__main__":
    import uvicorn
    # Hackathon için varsayılan port
    uvicorn.run(app, host="0.0.0.0", port=8000)
