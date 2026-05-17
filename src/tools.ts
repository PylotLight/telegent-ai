import fs from "node:fs/promises";
import path from "node:path";
import { BRAIN_DIR, OPENROUTER_API_KEY } from "./config";
import { lifxManager } from "./lifx";

export const AGENT_TOOLS = [
  { type: "function", function: { name: "execute_shell_command", description: "Executes a shell command. Requires approval.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "write_file", description: "Saves a file into ./brain", parameters: { type: "object", properties: { filename: { type: "string" }, content: { type: "string" } }, required: ["filename", "content"] } } },
  { type: "function", function: { name: "read_file", description: "Reads a file from ./brain", parameters: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] } } },
  { type: "function", function: { name: "list_brain_files", description: "Lists files in ./brain" } },
  { type: "function", function: { name: "search_openrouter_models", description: "Searches the OpenRouter API for LLM models. Pass query='free' to find free models, or search by name like 'llama'.", parameters: { type: "object", properties: { query: { type: "string" } } } } },
  { 
    type: "function", 
    function: { 
      name: "discover_lights", 
      description: "Scans the local network for LIFX lights and updates the registry. Returns a list of known lights.", 
      parameters: { type: "object", properties: {} } 
    } 
  },
  { 
    type: "function", 
    function: { 
      name: "set_light_state", 
      description: "Sets the state of a LIFX light (power, color, brightness, kelvin).", 
      parameters: { 
        type: "object", 
        properties: { 
          light_id: { type: "string", description: "The ID of the light" }, 
          power: { type: "boolean", description: "true for on, false for off" }, 
          color: { type: "string", description: "Hex code (e.g., #FF0000)" }, 
          brightness: { type: "number", description: "0-100" }, 
          kelvin: { type: "number", description: "2500-9000" } 
        }, 
        required: ["light_id"] 
      } 
    } 
  }
];

export function getSafeBrainPath(filename: string) {
  const safePath = path.normalize(path.join(BRAIN_DIR, filename));
  if (!safePath.startsWith(BRAIN_DIR)) throw new Error("Path traversal blocked.");
  return safePath;
}

export async function executeToolLocally(name: string, args: any): Promise<string> {
  try {
    if (name === "write_file") {
      await fs.writeFile(getSafeBrainPath(args.filename), args.content, "utf8");
      return `Saved ${args.filename}`;
    } 
    if (name === "read_file") {
      return await fs.readFile(getSafeBrainPath(args.filename), "utf8");
    } 
    if (name === "list_brain_files") {
      const files = await fs.readdir(BRAIN_DIR);
      return files.join("\n") || "Directory empty.";
    }
    if (name === "search_openrouter_models") {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      const data = await response.json();
      let models = data.data as any[];
      const query = args.query?.toLowerCase() || "";
      
      if (query === "free") {
        models = models.filter(m => parseFloat(m.pricing?.prompt || "1") === 0 && parseFloat(m.pricing?.completion || "1") === 0);
      } else if (query) {
        models = models.filter(m => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query));
      }
      const top = models.slice(0, 20);
      let res = top.map(m => `- ID: ${m.id} | Name: ${m.name}`).join("\n");
      return models.length > 20 ? res + `\n...and ${models.length - 20} more.` : (res || "No models found.");
    }
    if (name === "discover_lights") {
      const lights = await lifxManager.discoverAndSync();
      return JSON.stringify(lights, null, 2);
    }
    if (name === "set_light_state") {
      const result = await lifxManager.setLightState(args.light_id, {
        power: args.power,
        color: args.color,
        brightness: args.brightness,
        kelvin: args.kelvin
      });
      return `Successfully updated light ${result.id}`;
    }
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
  return "Unknown tool";
}
