import os
import argparse
from ultralytics import YOLO

def train_model(model_size='n', data_yaml='../data.yaml', epochs=50, imgsz=640):
   
    model_name = f"yolov8{model_size}.pt"
    print(f"Loading model: {model_name}")
    model = YOLO(model_name)

    data_path = os.path.abspath(data_yaml)
    if not os.path.exists(data_path):
        print(f"Error: Could not find data.yaml at {data_path}")
        return

    print(f"Starting training with data: {data_path}")
    results = model.train(
        data=data_path,
        epochs=epochs,
        imgsz=imgsz,
        plots=True
    )
    
    print("Training completed.")
    print(f"Best model saved to: {results.save_dir}/weights/best.pt")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train YOLOv8 model")
    parser.add_argument("--size", type=str, default="n", help="Model size: n, s, m, l, x")
    parser.add_argument("--data", type=str, default="../data.yaml", help="Path to data.yaml")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    
    args = parser.parse_args()
    train_model(args.size, args.data, args.epochs, args.imgsz)
