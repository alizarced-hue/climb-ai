const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

console.log("ENV PATH =", path.join(__dirname, ".env"));
console.log("ENV exists? =", fs.existsSync(path.join(__dirname, ".env")));
console.log("KEY loaded? =", !!process.env.MINIMAX_API_KEY);


// 1) 静态托管当前目录（让 index.html 能被打开）
app.use(express.static("."));

// 2) 后端代理：前端 -> /api/analyze -> MiniMax
app.post("/api/analyze", async (req, res) => {
  try {
    const { holds, imageWidth, imageHeight, colorName } = req.body || {};
    if (!Array.isArray(holds) || holds.length < 3) {
      return res.status(400).json({ error: "holds must be an array with length >= 3" });
    }

    if (!process.env.MINIMAX_API_KEY) {
      return res.status(500).json({ error: "MINIMAX_API_KEY missing in .env" });
    }

    const prompt = `
你是一个专业攀岩教练。

岩壁尺寸：${imageWidth} x ${imageHeight}
路线颜色：${colorName}

岩点坐标（左上角为原点）：
${holds.map((h, i) => `${i + 1}. (${Math.round(h.x)}, ${Math.round(h.y)})`).join("\n")}

请输出 JSON 数组，每个元素包含：
x, y, action, description, technique
只输出 JSON，不要解释。
`;
    
    console.log("➡️ Sending request to MiniMax API...");
    const aiRes = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.1",
        messages: [
          { role: "system", content: "You are a climbing route planner." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
      }),
    });

    console.log("⬅️ MiniMax HTTP status:", aiRes.status);

    if (!aiRes.ok) {
      const text = await aiRes.text();
      return res.status(aiRes.status).json({ error: text });
    }

const data = await aiRes.json();
const content = (data?.choices?.[0]?.message?.content || "").trim();
console.log("🧠 MiniMax raw content preview:", content.slice(0, 200));


let route = null;

// 1️⃣ 先尝试直接 parse（理想情况）
try {
  route = JSON.parse(content);
} catch (_) {
  // 2️⃣ 否则，从文本中“截取 JSON 数组”
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");

  if (start !== -1 && end !== -1 && end > start) {
    const slice = content.slice(start, end + 1);
    try {
      route = JSON.parse(slice);
    } catch (e) {
      return res.status(500).json({
        error: "Model returned non-JSON (failed to parse extracted array)",
        raw: content,
      });
    }
  } else {
    return res.status(500).json({
      error: "Model returned non-JSON (no JSON array found)",
      raw: content,
    });
  }
}

// 3️⃣ 最基本校验
if (!Array.isArray(route)) {
  return res.status(500).json({
    error: "Model output JSON is not an array",
    raw: content,
  });
}

return res.json({ route });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// 3) 启动服务（关键：必须监听端口）
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
