const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const SECRET_KEY = process.env.SECRET_KEY || 'your-super-secret-key-change-it-in-production';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware to see all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Helper to format date for filename
const getFormattedDate = () => {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${date}_${time}`;
};

// Custom Multer Storage
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            // Get username from decoded token (added by auth middleware)
            const username = req.user.sub;
            const userDir = path.join(__dirname, 'uploads', username);
            if (!fs.existsSync(userDir)) {
                fs.mkdirSync(userDir, { recursive: true });
            }
            cb(null, userDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = getFormattedDate();
        const sanitizedFilename = file.originalname.replace(/[^a-z0-t1-9.]/gi, '_');
        cb(null, `${timestamp}_${sanitizedFilename}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpg|jpeg|png/;
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, JPEG, and PNG images are allowed'));
        }
    }
});

// Auth Middleware (validates JWT)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ detail: 'Token missing' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ detail: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Prediction Proxy Route
app.post('/predict', authenticateToken, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ detail: 'No image file uploaded' });
    }

    try {
        // Prepare form data to forward to FastAPI
        const form = new FormData();
        form.append('file', fs.createReadStream(req.file.path));

        // Forward query params (like conf)
        const params = req.query;

        const response = await axios.post(`${FASTAPI_URL}/predict`, form, {
            params: params,
            headers: {
                ...form.getHeaders(),
                'Authorization': req.headers['authorization'],
                'X-Image-Name': req.file.filename
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('FastAPI error:', error.response ? error.response.data : error.message);
        const status = error.response ? error.response.status : 500;
        const detail = error.response ? error.response.data.detail : 'Internal server error';
        res.status(status).json({ detail: detail });
    }
});

// Serve uploaded images
app.get('/uploads/:username/:filename', authenticateToken, (req, res) => {
    const { username, filename } = req.params;
    console.log(`[DEBUG] Attempting to serve image: ${username}/${filename}`);

    // Security check: user can only access their own images
    if (req.user.sub !== username) {
        console.warn(`[AUTH] Access denied for user ${req.user.sub} to ${username}'s images`);
        return res.status(403).json({ detail: 'Access denied to this user\'s images' });
    }

    const filePath = path.join(__dirname, 'uploads', username, filename);
    console.log(`[DEBUG] Full file path: ${filePath}`);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error(`[ERROR] File not found on disk: ${filePath}`);
        res.status(404).json({ detail: 'Image not found' });
    }
});

// Proxy everything else to FastAPI (login, register, history)
app.use(async (req, res) => {
    try {
        const response = await axios({
            method: req.method,
            url: `${FASTAPI_URL}${req.url}`,
            data: req.body,
            params: req.query,
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': req.headers['content-type']
            },
            validateStatus: () => true // Allow all statuses to be proxied
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(500).json({ detail: 'Middleware proxy error' });
    }
});

app.listen(PORT, () => {
    console.log(`Node.js Storage Middleware running on http://localhost:${PORT}`);
    console.log(`Proxying to FastAPI at ${FASTAPI_URL}`);
});
