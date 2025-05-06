import { MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import userRoutes from './routes/user.route.js';
import dummyDataRoutes from './routes/dummy_data.route.js';
import MqttService from './services/mqtt.service.js';
import { isAdmin, isAuthenticated } from './middleware/auth.middleware.js';

let db;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 8080;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174', // Vite's default port
  'https://maize-watch-frontend.vercel.app', // Add your production frontend URL here
  'https://maize-watch-frontend.netlify.app',
  'https://maize-watch.vercel.app'
];

// CORS configuration
// const corsOptions = {
//   origin: function(origin, callback) {
//     // Allow requests with no origin (like mobile apps or curl requests)
//     if (!origin) return callback(null, true);
    
//     if (allowedOrigins.indexOf(origin) === -1) {
//       const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
//       return callback(new Error(msg), false);
//     }
//     return callback(null, true);
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// };

// // Apply CORS middleware (only once)
// app.use(cors(corsOptions));

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connect to MongoDB
const connectToMongo = async () => {
  try {
    // Connect to MongoDB directly for native driver usage
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db(); // <-- assign to the global variable
    console.log('Connected to MongoDB successfully using native driver');

    // ALSO connect with Mongoose for Mongoose model operations
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000, // Increase from default 10000
    });
    console.log('Connected to MongoDB successfully using Mongoose');
    
    return { client, db };
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Initialize MQTT service
let mqttService;
try {
  mqttService = new MqttService(process.env.MQTT_BROKER);
} catch (err) {
  console.error('MQTT service initialization error:', err);
}

// Routes
app.use('/auth', userRoutes);
app.use('/api', dummyDataRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('Maize Watch API is running');
});

// Health check endpoint
app.get('/health', (req, res) => {
  // Check MongoDB connection
  const isMongoConnected = mongoose.connection.readyState === 1;
  
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    mongodb: isMongoConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// API Routes - Protected by admin middleware
// Get all users - admin only
app.get('/api/users', isAdmin, async (req, res) => {
  try {
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch (err) {
    console.error('Error getting users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user - admin only
app.post('/api/users', isAdmin, async (req, res) => {
  try {
    const result = await db.collection('users').insertOne(req.body);
    res.status(201).json({ ...req.body, _id: result.insertedId });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get single user - admin only
app.get('/api/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Error getting user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user - admin only
app.put('/api/users/:id', isAdmin, async (req, res) => {
  try {
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user - admin only
app.delete('/api/users/:id', isAdmin, async (req, res) => {
  try {
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Create an admin user programmatically (only for initial setup)
app.post('/setup/create-admin', async (req, res) => {
  // Check if admin already exists
  try {
    const adminExists = await db.collection('users').findOne({ role: 'admin' });
    if (adminExists) {
      return res.status(400).json({ 
        message: 'Admin account already exists',
        info: 'For security reasons, you can only create one admin account'
      });
    }
    
    // Create admin with provided credentials or default ones
    const adminUser = {
      username: req.body.username || 'admin',
      password: req.body.password || 'adminPassword123', // You should hash this in production
      fullName: req.body.fullName || 'System Administrator',
      contactNumber: req.body.contactNumber || '1234567890',
      address: req.body.address || 'Admin Address',
      email: req.body.email || 'admin@example.com',
      role: 'admin', // This is fixed and cannot be changed
      createdAt: new Date().toISOString()
    };
    
    const result = await db.collection('users').insertOne(adminUser);
    
    // For security, don't return the password
    const { password, ...adminWithoutPassword } = adminUser;
    
    res.status(201).json({
      message: 'Admin account created successfully',
      admin: { ...adminWithoutPassword, _id: result.insertedId }
    });
    
  } catch (err) {
    console.error('Error creating admin:', err);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// Error handling middleware - should be after all routes
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? null : err.message
  });
});

// Start server after connecting to MongoDB
const startServer = async () => {
  let client;
  try {
    const connections = await connectToMongo();
    client = connections.client;
    
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
    });
    
    // Handle application shutdown gracefully
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        await client.close();
        console.log('MongoDB connections closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });
    
  } catch (err) {
    console.error('Failed to start server:', err);
    if (client) await client.close();
    process.exit(1);
  }
};

startServer();