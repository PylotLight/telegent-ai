import { Cron } from "croner";
import { Bot } from "grammy";
import { DB } from "./db";
import { processUserMessage } from "./commands";
import { agentConfig } from "./config";

const jobs = new Map<string, Cron>();
let activeBot: Bot | null = null;

export function initScheduler(bot: Bot) {
  activeBot = bot;
  const tasks = DB.getScheduledTasks();
  for (const task of tasks) {
    startJob(task);
  }
}

export function startJob(task: any) {
  if (!activeBot) return;
  if (jobs.has(task.id)) {
    jobs.get(task.id)?.stop();
  }

  const isOneTime = task.type === "one_time";
  let triggerTime: Date | string;
  
  if (isOneTime) {
    triggerTime = new Date(task.time_expression);
    // If the timer is already in the past, clean it up and ignore
    if (triggerTime.getTime() < Date.now()) {
        DB.deleteScheduledTask(task.id);
        return;
    }
  } else {
    // It's a cron expression
    triggerTime = task.time_expression;
  }
  
  try {
    const options: { timezone?: string } = {};
    if (typeof triggerTime === "string") {
      options.timezone = agentConfig.timezone;
    }

    const job = new Cron(triggerTime, options, async () => {
      if (!activeBot) return;
      DB.upsertThread(task.thread_key, { lastActive: Date.now() });
      
      // We spoof a system-level command so the bot knows a timer went off
      const triggerPrompt = `[SYSTEM: SCHEDULED TASK TRIGGERED]\nTask Description: ${task.action_prompt}`;
      
      // Notify the user subtly that a task triggered
      await activeBot.api.sendMessage(
          task.chat_id, 
          `⏰ _Running scheduled task\.\.\._`, 
          { parse_mode: "MarkdownV2", message_thread_id: task.thread_key }
      ).catch(()=>{});

      // Trigger the agent loop using processUserMessage
      await processUserMessage(activeBot, triggerPrompt, task.thread_key, task.chat_id);
      
      if (isOneTime) {
        DB.deleteScheduledTask(task.id);
        jobs.delete(task.id);
      }
    });
    
    jobs.set(task.id, job);
  } catch (e: any) {
     console.error(`Error starting scheduled job ${task.id}:`, e.message);
  }
}

export function scheduleNewTask(task: { id: string, threadKey: number, chatId: number, type: string, timeExpr: string, actionPrompt: string }) {
  DB.addScheduledTask(task);
  startJob({
      id: task.id,
      thread_key: task.threadKey,
      chat_id: task.chatId,
      type: task.type,
      time_expression: task.timeExpr,
      action_prompt: task.actionPrompt
  });
}

export function removeScheduledTask(id: string) {
  if (jobs.has(id)) {
    jobs.get(id)?.stop();
    jobs.delete(id);
  }
  DB.deleteScheduledTask(id);
}