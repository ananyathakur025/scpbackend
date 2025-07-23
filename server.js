const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Allowed frontend origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://speechprogresspredict.vercel.app'
];

// ✅ CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`❌ CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(bodyParser.json());

// ✅ Root health check
app.get('/', (req, res) => {
  res.send("✅ Speech backend is running!");
});

// ✅ Predict endpoint
app.post('/predict', async (req, res) => {
  console.log("🛎️ Received request at /predict");

  const transcript = req.body.transcript;
  if (!transcript) {
    return res.status(400).json({ error: "Transcript is required" });
  }

  // ✅ Use either debug or normal script
  const debugScriptPath = path.join(__dirname, 'scripts', 'debug_predict.py');
  const originalScriptPath = path.join(__dirname, 'scripts', 'predict.py');
  const scriptPath = fs.existsSync(debugScriptPath) ? debugScriptPath : originalScriptPath;

  console.log("📁 Using script path:", scriptPath);

  const pythonCommands = ['python3', 'python', 'py'];

  for (const pythonCmd of pythonCommands) {
    try {
      const python = spawn(pythonCmd, [scriptPath]);
      python.stdin.write(JSON.stringify({ transcript }));
      python.stdin.end();

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      python.stderr.on('data', (err) => {
        errorOutput += err.toString();
        console.error(`❌ Python stderr (${pythonCmd}):`, err.toString());
      });

      python.on('close', (code) => {
        console.log(`🔚 Python process exited with code ${code}`);

        if (code !== 0 || !output.trim()) {
          return res.status(500).json({
            error: "Python script error",
            details: errorOutput || 'No output from Python script',
            code,
            pythonCommand: pythonCmd
          });
        }

        try {
          const result = JSON.parse(output);
          console.log("✅ Result sent to frontend:", result);
          res.json({ prediction: result.prediction || result });
        } catch (err) {
          res.status(500).json({
            error: "Invalid JSON from Python script",
            rawOutput: output,
            stderr: errorOutput
          });
        }
      });

      python.on('error', (err) => {
        console.error(`❌ Failed to start Python process (${pythonCmd}):`, err);
        if (pythonCmd === pythonCommands[pythonCommands.length - 1]) {
          res.status(500).json({ error: "Failed to start Python process", details: err.message });
        }
      });

      break; // Exit loop once one command succeeds
    } catch (err) {
      console.error(`❌ Error with Python command ${pythonCmd}:`, err);
      continue;
    }
  }
});

// ✅ Test endpoint for frontend connection check
app.get('/test', (req, res) => {
  res.json({
    message: "Backend is working!",
    nodeVersion: process.version,
    cwd: process.cwd(),
    timestamp: new Date().toISOString()
  });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
