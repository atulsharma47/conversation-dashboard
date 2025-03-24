import 'dotenv/config'; 
import express from 'express';
import http from 'http';
import { Server as socketIo } from 'socket.io';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcrypt';

// Initialize application
const app = express();
const server = http.createServer(app);
const io = new socketIo(server);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log("MongoDB connected successfully");
});

// Define User and Message Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    content: { type: String, required: true },
    attachments: [String],
    timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET;

// File Upload Setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).send('Token missing');

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send('Token invalid');
        req.user = user; // Add user information to the request
        next();
    });
};

// User Authentication
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).send('User registered');
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Server error');
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ token });
        } else {
            res.status(401).send('Unauthorized');
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Server error');
    }
});

// Messages API with authentication
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 }).exec();
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).send('Server error');
    }
});

app.post('/api/messages', [authenticateToken, upload.array('files')], async (req, res) => {
    try {
        const { content } = req.body;
        const attachments = req.files ? req.files.map(file => file.path) : [];
        const newMessage = new Message({ sender: req.user.username, content, attachments });
        await newMessage.save();
        io.emit('newMessage', newMessage); // Emit new message to all clients
        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Server error');
    }
});

// Socket.io Real-Time Communication
io.on('connection', (socket) => {
    console.log('A user connected');
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });

    socket.on('newMessage', (message) => {
        io.emit('newMessage', message);
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
