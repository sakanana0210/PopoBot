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

// === Webhook 接收訊息 ===
const client = new Client(config);
const app = express();
let db;

// ✅ 對 /webhook 只用 express.raw，其他 route 可用 express.json()
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json()); // 其他 route

// === Webhook ===
app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events || [];
  console.log("🌿 收到 webhook:", JSON.stringify(events, null, 2));

  try {
    for (let event of events) {
      // 僅處理文字訊息
      if (event.type === "message" && event.message.type === "text") {
        const messageText = event.message.text;
        console.log(`[LOG] 收到訊息: "${messageText}" 來自:`, event.source);

        // 💩 關鍵字觸發紀錄
        if (messageText.includes("💩")) {
          const today = new Date().toISOString().slice(0, 10);
          const userId = event.source.userId || "unknown_user";
          const groupId = event.source.groupId || null;
          let displayName = userId; // 預設顯示 ID

          // 嘗試取得顯示名稱
          try {
            if (event.source.type === "user") {
              const profile = await client.getProfile(userId);
              displayName = profile.displayName;
            } else if (event.source.type === "group" && groupId) {
              const profile = await client.getGroupMemberProfile(groupId, userId);
              displayName = profile.displayName;
            }
          } catch (err) {
            console.warn("[WARN] 無法取得使用者名稱，使用 userId:", err.message);
          }

          // 寫入資料庫
          try {
            await db.run(
              `
              INSERT INTO poop_log (user_id, group_id, display_name, count_date, count)
              VALUES (?, ?, ?, ?, 1)
              ON CONFLICT(user_id, group_id, count_date)
              DO UPDATE SET count = count + 1
              `,
              [userId, groupId, displayName, today]
            );

            console.log(
              `[💩 LOG] 新增記錄 => userId=${userId}, groupId=${groupId}, displayName=${displayName}, date=${today}`
            );
          } catch (err) {
            console.error("[DB ERROR]", err);
          }
        }
      }
    }

    // 一定要回 200，不然 LINE 會報 500 錯誤
    res.sendStatus(200);
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err);
    res.sendStatus(500);
  }
});

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;
  for (let event of events) {
    if (event.type === "message" && event.message.type === "text") {
   
    }
  }
  res.sendStatus(200);
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
