import cv2
import numpy as np
from ultralytics import YOLO
import base64

class YOLOInference:
    def __init__(self, model_path='yolov8n.pt'):
       
        self.model = YOLO(model_path)

    def validate_quality(self, img):
        
        h, w = img.shape[:2]
        if h < 128 or w < 128:
            return {
                "valid": False, 
                "reason": "Low resolution", 
                "message": "The image resolution is too low. Please upload a higher quality image."
            }

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 20:
            return {
                "valid": False, 
                "reason": "Image is blurry or unclear", 
                "message": "Please upload a clear, well-lit image of your scalp or head."
            }

        avg_brightness = np.mean(gray)
        if avg_brightness < 40: 
            return {
                "valid": False, 
                "reason": "Image is too dark", 
                "message": "The image is too dark. Please upload a well-lit image."
            }
        if avg_brightness > 220: 
            return {
                "valid": False, 
                "reason": "Image is overexposed", 
                "message": "The image is overexposed. Please ensure proper lighting without glare."
            }

        return {"valid": True}

    def is_relevant_content(self, img, detections):
     
        if len(detections) > 0:
            return True

        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        color_mean = np.mean(hsv, axis=(0, 1))
        
        s_mean, v_mean = color_mean[1], color_mean[2]
        
        if s_mean < 10 or v_mean < 30 or v_mean > 240:
            return False
            
        return True

    def predict(self, image_bytes, conf=0.25):
        """
        Runs the advanced inference pipeline.
        """
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"status": "error", "message": "Could not decode image."}

        # 1. Image Quality Validation
        quality = self.validate_quality(img)
        if not quality["valid"]:
            return {
                "status": "rejected",
                "reason": quality["reason"],
                "message": quality["message"]
            }

        results = self.model(img, conf=conf)[0]
        
        detections = []
        for box in results.boxes:
            detection = {
                "bbox": [float(x) for x in box.xyxy[0].tolist()],
                "confidence": float(box.conf[0]),
                "class_id": int(box.cls[0]),
                "class_name": results.names[int(box.cls[0])]
            }
            detections.append(detection)

        if not self.is_relevant_content(img, detections):
            return {
                "status": "rejected",
                "reason": "Invalid image content",
                "message": "The uploaded image does not appear to be a head or scalp. Please upload a valid scalp image."
            }

        if len(detections) == 0:
            return {
                "status": "success",
                "diagnosis": "No Alopecia Detected",
                "message": "The scalp and hair appear normal. No signs of alopecia were detected."
            }

        annotated_img = results.plot()
        _, buffer = cv2.imencode('.png', annotated_img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "status": "success",
            "detections": detections,
            "annotated_image": img_base64
        }
