const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Enhanced allowed frontend origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001', 
  'https://speechprogresspredict.vercel.app',
  'https://speech-backend-wvx5.onrender.com' // Self-reference for health checks
];

console.log('🌐 Server starting with allowed origins:', allowedOrigins);
console.log('🚀 Environment:', process.env.NODE_ENV || 'development');
console.log('📁 Working directory:', process.cwd());

// ✅ Enhanced CORS middleware with better logging
app.use(cors({
  origin: function (origin, callback) {
    console.log(`🔍 CORS check for origin: ${origin || 'no-origin'}`);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('✅ Allowing request with no origin');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Origin allowed:', origin);
      callback(null, true);
    } else {
      console.error(`❌ CORS blocked request from origin: ${origin}`);
      console.error('Allowed origins:', allowedOrigins);
      callback(new Error(`CORS: Origin ${origin} is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// ✅ Enhanced body parser with error handling
app.use(bodyParser.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch(e) {
      console.error('❌ Invalid JSON in request body:', e.message);
      res.status(400).json({ error: 'Invalid JSON in request body' });
      return;
    }
  }
}));

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body keys:', Object.keys(req.body));
  }
  next();
});

// ✅ Root health check with detailed info
app.get('/', (req, res) => {
  const healthInfo = {
    status: "✅ Speech backend is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    cwd: process.cwd(),
    allowedOrigins: allowedOrigins,
    endpoints: [
      'GET /',
      'GET /test', 
      'POST /predict'
    ]
  };
  
  console.log('🏥 Health check requested');
  res.json(healthInfo);
});

// ✅ Enhanced test endpoint
app.get('/test', (req, res) => {
  const testInfo = {
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    environment: process.env.NODE_ENV || 'development',
    origin: req.get('origin') || 'no-origin',
    userAgent: req.get('user-agent') || 'no-user-agent',
    allowedOrigins: allowedOrigins
  };
  
  console.log('🧪 Test endpoint called');
  res.json(testInfo);
});

// ✅ Enhanced predict endpoint with better error handling
app.post('/predict', async (req, res) => {
  console.log("🛎️ Received request at /predict");
  console.log("📝 Request body:", req.body);
  
  const transcript = req.body.transcript;
  
  if (!transcript) {
    console.error("❌ No transcript provided");
    return res.status(400).json({ 
      error: "Transcript is required",
      received: req.body 
    });
  }

  if (typeof transcript !== 'string') {
    console.error("❌ Transcript is not a string:", typeof transcript);
    return res.status(400).json({ 
      error: "Transcript must be a string",
      receivedType: typeof transcript 
    });
  }

  if (transcript.trim().length === 0) {
    console.error("❌ Empty transcript provided");
    return res.status(400).json({ 
      error: "Transcript cannot be empty" 
    });
  }

  // ✅ Check if Python script exists
  const debugScriptPath = path.join(__dirname, 'scripts', 'debug_predict.py');
  const originalScriptPath = path.join(__dirname, 'scripts', 'predict.py');
  const scriptPath = fs.existsSync(debugScriptPath) ? debugScriptPath : originalScriptPath;
  
  console.log("📁 Checking script paths:");
  console.log("  Debug script exists:", fs.existsSync(debugScriptPath));
  console.log("  Original script exists:", fs.existsSync(originalScriptPath));
  console.log("  Using script path:", scriptPath);

  if (!fs.existsSync(scriptPath)) {
    console.error("❌ Python script not found:", scriptPath);
    return res.status(500).json({ 
      error: "Python script not found",
      scriptPath: scriptPath,
      cwd: process.cwd(),
      scriptsDir: path.join(__dirname, 'scripts')
    });
  }

  // ✅ Try different Python commands
  const pythonCommands = ['python3', 'python', 'py'];
  let scriptExecuted = false;

  for (const pythonCmd of pythonCommands) {
    if (scriptExecuted) break;

    try {
      console.log(`🐍 Trying Python command: ${pythonCmd}`);
      
      const python = spawn(pythonCmd, [scriptPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Send input to Python script
      const inputData = JSON.stringify({ transcript });
      console.log("📤 Sending to Python:", inputData);
      
      python.stdin.write(inputData);
      python.stdin.end();

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (chunk) => {
        const data = chunk.toString();
        console.log(`📥 Python stdout chunk: ${data}`);
        output += data;
      });

      python.stderr.on('data', (err) => {
        const errorData = err.toString();
        console.error(`❌ Python stderr: ${errorData}`);
        errorOutput += errorData;
      });

      python.on('close', (code) => {
        console.log(`🔚 Python process exited with code ${code}`);
        console.log(`📤 Full Python output: ${output}`);
        console.log(`❌ Full Python errors: ${errorOutput}`);

        if (scriptExecuted) return; // Prevent multiple responses
        scriptExecuted = true;

        if (code !== 0) {
          return res.status(500).json({
            error: "Python script execution failed",
            exitCode: code,
            stderr: errorOutput,
            stdout: output,
            pythonCommand: pythonCmd,
            scriptPath: scriptPath
          });
        }

        if (!output.trim()) {
          return res.status(500).json({
            error: "No output from Python script",
            exitCode: code,
            stderr: errorOutput,
            pythonCommand: pythonCmd,
            scriptPath: scriptPath
          });
        }

        try {
          const result = JSON.parse(output.trim());
          console.log("✅ Parsed result:", result);
          
          const prediction = result.prediction !== undefined ? result.prediction : result;
          
          if (typeof prediction !== 'number') {
            throw new Error(`Expected number, got ${typeof prediction}: ${prediction}`);
          }

          console.log("✅ Sending successful response:", { prediction });
          res.json({ prediction });
        } catch (parseError) {
          console.error("❌ JSON parse error:", parseError);
          res.status(500).json({
            error: "Invalid JSON from Python script",
            parseError: parseError.message,
            rawOutput: output,
            stderr: errorOutput,
            pythonCommand: pythonCmd
          });
        }
      });

      python.on('error', (err) => {
        console.error(`❌ Failed to start Python process (${pythonCmd}):`, err.message);
        
        if (scriptExecuted) return; // Prevent multiple responses
        
        // If this was the last command to try, send error response
        if (pythonCmd === pythonCommands[pythonCommands.length - 1]) {
          scriptExecuted = true;
          res.status(500).json({ 
            error: "Failed to start Python process with any command",
            details: err.message,
            triedCommands: pythonCommands,
            scriptPath: scriptPath
          });
        }
      });

      // Set a timeout for the Python process
      setTimeout(() => {
        if (!scriptExecuted) {
          console.error(`⏰ Python process timeout (${pythonCmd})`);
          python.kill('SIGTERM');
          
          if (pythonCmd === pythonCommands[pythonCommands.length - 1]) {
            scriptExecuted = true;
            res.status(500).json({
              error: "Python script execution timeout",
              pythonCommand: pythonCmd,
              timeout: "30 seconds"
            });
          }
        }
      }, 30000); // 30 second timeout

      break; // Exit the loop if spawn succeeded

    } catch (err) {
      console.error(`❌ Error with Python command ${pythonCmd}:`, err.message);
      
      // If this was the last command and we haven't sent a response
      if (pythonCmd === pythonCommands[pythonCommands.length - 1] && !scriptExecuted) {
        scriptExecuted = true;
        res.status(500).json({ 
          error: "Failed to execute Python script",
          details: err.message,
          triedCommands: pythonCommands,
          scriptPath: scriptPath
        });
      }
      continue;
    }
  }
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Global error handler:', err);
  
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      error: 'CORS Error',
      message: err.message,
      origin: req.get('origin'),
      allowedOrigins: allowedOrigins
    });
  } else {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'Unknown error occurred'
    });
  }
});

// ✅ 404 handler
app.use('*', (req, res) => {
  console.log(`❓ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    availableRoutes: ['GET /', 'GET /test', 'POST /predict']
  });
});

// ✅ Start server with enhanced logging
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Working directory: ${process.cwd()}`);
  console.log(`🐍 Available endpoints:`);
  console.log(`   GET  / - Health check`);
  console.log(`   GET  /test - Connection test`);
  console.log(`   POST /predict - Speech prediction`);
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(', ')}`);
});

// ✅ Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
