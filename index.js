import express from "express";
import { Client, middleware } from "@line/bot-sdk";
import { initDB } from "./db.js";
import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();
let db;

// ✅ 對 /webhook 只用 express.raw，其他 route 可用 express.json()
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json()); // 其他 route

// === Webhook ===
app.post("/webhook", middleware(config), async (req, res) => {
  try {
    const events = req.body.events || [];
    console.log("🌿 收到 webhook:", events);

    for (let event of events) {
      if (event.type === "message" && event.message.type === "text") {
        console.log(`[LOG] 收到訊息: ${event.message.text}`);
        // 你的 DB 處理邏輯...
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err);
    res.sendStatus(500);
  }
});

// === 排名推播函數 ===
async function pushRanking(groupId, title, rows) {
  let msg = `${title}\n`;
  rows.forEach((row, i) => {
    msg += `${i + 1}. ${row.display_name || row.user_id}：${row.total} 次\n`;
  });

  try {
    await client.pushMessage(groupId, { type: "text", text: msg });
    console.log(`[LOG] 推播訊息到群組 ${groupId} 成功`);
  } catch (err) {
    console.error(
      `[ERROR] 推播失敗 groupId=${groupId}`,
      err.originalError?.response?.data || err
    );
  }
}

// === 排行榜計算函數 ===
async function calculateRanking(dateCondition, titlePrefix) {
  const rows = await db.all(
    `
    SELECT group_id, user_id, display_name, SUM(count) as total
    FROM poop_log
    WHERE ${dateCondition}
    GROUP BY group_id, user_id
    ORDER BY total DESC
  `
  );

  if (rows.length === 0) {
    console.log(`[LOG] ${titlePrefix} 沒有任何紀錄`);
    return;
  }

  const byGroup = {};
  rows.forEach((r) => {
    if (!byGroup[r.group_id]) byGroup[r.group_id] = [];
    byGroup[r.group_id].push(r);
  });

  for (let groupId in byGroup) {
    await pushRanking(groupId, `${titlePrefix}`, byGroup[groupId]);
  }
}

// === 每日排行（前一天） ===
cron.schedule("5 0 * * *", async () => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const dateStr = y.toISOString().slice(0, 10);
  await calculateRanking(`count_date = '${dateStr}'`, `💩 ${dateStr} 排行榜 💩`);
});

// === 每週排行（上週五前七天） ===
cron.schedule("5 0 * * 5", async () => { // 每週五 00:05 執行
  const today = new Date();            // 今天週五
  const end = new Date(today);
  end.setDate(today.getDate() - 1);    // 上週五（今天就是週五）
  const start = new Date(end);
  start.setDate(end.getDate() - 6);    // 前七天的第一天

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  await calculateRanking(
    `count_date >= '${startStr}' AND count_date <= '${endStr}'`,
    `💩 七天排行榜 💩`
  );
});

// === 每天 00:10 執行 刪除30天以前的資料 ===
cron.schedule("10 0 * * *", async () => { // 每天 00:10 執行
  const d = new Date();
  d.setDate(d.getDate() - 30); // 保留最近 30 天
  const dateStr = d.toISOString().slice(0, 10);
  await db.run(`DELETE FROM poop_log WHERE count_date < '${dateStr}'`);
  console.log(`已刪除 ${dateStr} 以前的資料`);
});

// === 啟動 server ===
(async () => {
  db = await initDB();
  const port = process.env.PORT || 10000;
  app.listen(port, () => console.log(`💩 Bot running on ${port}`));
})();
