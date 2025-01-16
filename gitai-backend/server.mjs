import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';

// Load environment variables
dotenv.config();

const app = express();
const git = simpleGit();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  store: new session.MemoryStore() // For development only
}));

app.use(passport.initialize());
app.use(passport.session());

// Configure Passport serialization
passport.serializeUser((user, done) => {
  try {
    done(null, {
      _id: user._id,
      username: user.username,
      email: user.email,
      googleId: user.googleId
    });
  } catch (err) {
    done(err, null);
  }
});

passport.deserializeUser((user, done) => {
  try {
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Configure Google OAuth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:5000/auth/google/callback"
    },
    async function(accessToken, refreshToken, profile, done) {
      try {
        let user = await User.findOne({ 
          $or: [
            { googleId: profile.id },
            { email: profile.emails[0].value }
          ]
        });
        
        if (!user) {
          user = await User.create({
            username: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id
          });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Basic routes for Google OAuth
app.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: 'http://localhost:3000/login?error=auth_failed'
  }),
  function(req, res) {
    try {
      const token = jwt.sign(
        { 
          userId: req.user._id, 
          username: req.user.username,
          email: req.user.email 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.redirect(`http://localhost:3000/gitrepo?token=${token}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('http://localhost:3000/login?error=auth_failed');
    }
  }
);

// Initialize embeddings with sentence-transformer
const embeddings = new HuggingFaceInferenceEmbeddings({
  model: "sentence-transformers/all-MiniLM-L6-v2",
  apiKey: process.env.HUGGINGFACE_API_KEY
});

// Initialize OpenAI with GPT-4
const llm = new ChatOpenAI({
  modelName: "gpt-4",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7,
  maxTokens: 1000
});

// Initialize text splitter
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Store for vector database
let vectorStore = null;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gitai', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB successfully');
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
});

// Update User Schema to include Google ID and email
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String },  // Make password optional for OAuth users
  email: { type: String, unique: true },
  googleId: { type: String, sparse: true },  // For Google OAuth users
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: 'User created successfully', userId: newUser._id });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Account not Found!' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET ,
      { expiresIn: '24h' }
    );

    res.json({
      id: user._id,
      username: user.username,
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update the authenticateUser middleware
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Use authentication middleware for protected routes
app.post('/query', authenticateUser, async (req, res) => {
  const { query, repoLink, userId } = req.body;
  const cloneDir = './cloned-repo';

  try {
    // Validate query length
    const wordCount = query.trim().split(/\s+/).length;
    if (wordCount > 50) {
      throw new Error('Query must not exceed 15 words');
    }

    // If repoLink is provided and repository hasn't been cloned yet
    if (repoLink && !fs.existsSync(cloneDir)) {
      console.log(`Cloning repository from ${repoLink}...`);
      
      // Clean up existing directory if it exists
      if (fs.existsSync(cloneDir)) {
        fs.rmSync(cloneDir, { recursive: true, force: true });
      }

      // Clone the repository
      await git.clone(repoLink, cloneDir);
      console.log('Repository cloned successfully');

      // Read and process all files from the cloned repo
      const files = readFilesRecursively(cloneDir);
      const documents = await processRepository(files, cloneDir);
      
      // Create and store the vector store
      vectorStore = await FaissStore.fromDocuments(documents, embeddings);
      console.log('Repository indexed successfully');
    }

    if (!vectorStore) {
      throw new Error('Repository not indexed yet');
    }

    // Search for relevant documents
    const searchResults = await vectorStore.similaritySearch(query, 5);
    
    // Prepare context from search results
    const relevantContent = searchResults.map(doc => 
      `File: ${doc.metadata.path}\n${doc.pageContent}`
    ).join('\n\n');

    // Create prompt for GPT-4
    const prompt = `
    Based on the following repository context, please answer the question. 
    Be specific and reference relevant code or files when appropriate.

    Repository Context:
    ${relevantContent}

    Question: ${query}
    `;

    // Generate response using GPT-4 and extract the text content
    const completion = await llm.invoke(prompt);
    // Extract the actual text content from the ChatGPT response
    const responseText = completion.content || "No response generated.";
    
    res.json({ response: responseText });

  } catch (error) {
    console.error('Error processing request:', error.message);
    res.status(500).json({ 
      error: 'Request failed',
      details: error.message 
    });
  }
});

// Add token verification endpoint
app.post('/verify-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user data
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Function to read files recursively
const readFilesRecursively = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    // Skip node_modules, .git directories, and hidden files
    if (file === 'node_modules' || file === '.git' || file.startsWith('.')) {
      return;
    }
    
    if (stat && stat.isDirectory()) {
      results = results.concat(readFilesRecursively(filePath));
    } else {
      // Skip binary and unqueryable files
      const unqueryableExtensions = /\.(jpg|jpeg|png|gif|mp3|mp4|wav|zip|tar|gz|rar|bin|exe|dll|so|dylib)$/i;
      const isUnqueryable = unqueryableExtensions.test(file);
      const isTooBig = stat.size > 1000000; // Skip files larger than 1MB
      
      if (!isUnqueryable && !isTooBig) {
        results.push(filePath);
      }
    }
  });

  return results;
};

// Function to process repository files
const processRepository = async (files, cloneDir) => {
  const documents = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(cloneDir, file);
      
      // Split text into chunks
      const textChunks = await textSplitter.splitText(content);
      
      // Create documents with metadata
      const docs = textChunks.map(chunk => ({
        pageContent: chunk,
        metadata: {
          path: relativePath,
          source: file,
        }
      }));
      
      documents.push(...docs);
    } catch (err) {
      console.warn(`Failed to process file: ${file}`, err.message);
    }
  }

  return documents;
};




