const express = require("express");
const app = express();

app.use(express.json());

const authRoutes = require("./routes/auth.routes");
const verifyToken = require("./middleware/auth.middleware");
const allowRoles = require("./middleware/role.middleware");
const upload = require("./middleware/upload.middleware");
const files = require("./models/file.model");
const normalizeToPdf = require("./services/normalize.service");

app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Backend is working 🚀");
});

app.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "You are authorized",
    user: req.user
  });
});

app.get("/admin-only",
  verifyToken,
  allowRoles("Admin"),
  (req, res) => {
    res.json({ message: "Welcome Admin 👑" });
  }
);

app.post(
  "/upload",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const newFile = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        originalPath: req.file.path,
        normalizedPdfPath: null,
        normalizedFileName: null,
        status: "Queued",
        uploadedBy: req.user.username
      };

      files.push(newFile);

      setTimeout(async () => {
        try {
          newFile.status = "Processing";

          const normalized = await normalizeToPdf(req.file);

          newFile.normalizedPdfPath = normalized.normalizedPdfPath;
          newFile.normalizedFileName = normalized.normalizedFileName;
          newFile.normalizedType = normalized.type;

          newFile.status = "Done";
        } catch (error) {
          newFile.status = "Failed";
          newFile.error = error.message;
        }
      }, 2000);

      res.json({
        message: "File uploaded and queued for normalization",
        file: newFile
      });

    } catch (error) {
      res.status(500).json({
        message: "Upload failed",
        error: error.message
      });
    }
  }
);
// app.post(
//   "/upload",
//   verifyToken,
//   upload.single("file"),
//   (req, res) => {
//     const newFile = {
//       filename: req.file.filename,
//       originalName: req.file.originalname,
//       status: "Queued",
//       uploadedBy: req.user.username
//     };

//     files.push(newFile);

//     // simulate processing
//     setTimeout(() => {
//       newFile.status = "Processing";

//       setTimeout(() => {
//         newFile.status = "Done";
//       }, 3000);

//     }, 2000);

//     res.json({
//       message: "File uploaded successfully",
//       file: newFile
//     });
//   }
// );

app.get("/files", (req, res) => {
  res.json(files);
});

app.patch("/files/:filename/status", (req, res) => {
  const { filename } = req.params;
  const { status } = req.body;

  const file = files.find(f => f.filename === filename);

  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  file.status = status;

  res.json({
    message: "Status updated",
    file
  });
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});