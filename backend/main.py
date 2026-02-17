import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from inference import YOLOInference
from database import connect_to_mongo, close_mongo_connection, get_database
from auth import (
    get_password_hash, 
    verify_password, 
    create_access_token, 
    get_current_user
)
import uvicorn
from datetime import datetime
from bson import ObjectId

app = FastAPI(title="YOLOv8 Object Detection API")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup and Shutdown events for MongoDB
@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

# Load model - search for trained weights first
def get_model_path():
    # 1. Environment variable
    env_path = os.getenv("YOLO_MODEL_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    
    # 2. Local best.pt from training in backend/
    local_path = os.path.join(os.getcwd(), "runs", "detect", "train", "weights", "best.pt")
    if os.path.exists(local_path):
        return local_path
        
    # 3. Path from project root perspective (one level up)
    root_path = os.path.join(os.path.dirname(os.getcwd()), "runs", "detect", "train", "weights", "best.pt")
    if os.path.exists(root_path):
        return root_path

    # 4. Fallback to base model
    return "yolov8n.pt"

MODEL_PATH = get_model_path()
print(f"Server initializing with model: {MODEL_PATH}")

try:
    yolo_model = YOLOInference(MODEL_PATH)
except Exception as e:
    print(f"Error loading model {MODEL_PATH}: {e}")
    yolo_model = None

# --- Authentication Routes ---

@app.post("/register")
async def register(form_data: OAuth2PasswordRequestForm = Depends()):
    db = get_database()
    existing_user = await db.users.find_one({"username": form_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    user_dict = {
        "username": form_data.username,
        "hashed_password": get_password_hash(form_data.password),
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(user_dict)
    return {"message": "User registered successfully"}

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = get_database()
    user = await db.users.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

# --- Prediction Routes ---

@app.post("/predict")
async def predict(
    file: UploadFile = File(...), 
    conf: float = 0.25,
    current_user: dict = Depends(get_current_user),
    x_image_name: str = Header(None)
):
    """
    Endpoint to receive an image and return detection results.
    Optional 'conf' parameter to adjust detection threshold.
    Logs history to MongoDB for the current user.
    """
    if not yolo_model:
        raise HTTPException(status_code=500, detail="YOLO model not loaded on server.")
    
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG and PNG are supported.")

    try:
        contents = await file.read()
        results = yolo_model.predict(contents, conf=conf)
        
        db = get_database()
        history_item = {
            "user_id": current_user["_id"],
            "username": current_user["username"],
            "filename": file.filename,
            "image_filename": x_image_name if x_image_name else file.filename,
            "status": results.get("status", "unknown"),
            "diagnosis": results.get("diagnosis", ""),
            "detections": results.get("detections", []),
            "timestamp": datetime.utcnow()
        }
        await db.history.insert_one(history_item)
        
        return results
    except Exception as e:
        print(f"Prediction Error: {e}") 
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

@app.get("/history")
async def get_history(current_user: dict = Depends(get_current_user)):
    """
    Returns the prediction history for the current user.
    """
    db = get_database()
    cursor = db.history.find({"user_id": current_user["_id"]}).sort("timestamp", -1).limit(20)
    history = []
    async for item in cursor:
        item["_id"] = str(item["_id"])
        item["user_id"] = str(item["user_id"])
        history.append(item)
    return history

@app.get("/health")
async def health():
    return {"status": "healthy", "model": MODEL_PATH}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
