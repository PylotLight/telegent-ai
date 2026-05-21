import { Client } from "lifx-lan-client";
import { DB } from "./db";

class LifxManager {
  private client: Client;
  private initialized: Promise<void>;

  constructor() {
    this.client = new Client();
    this.initialized = this.init();
  }

  private async init() {
    try {
      await this.client.init();
    } catch (err) {
      console.error("LIFX init error:", err);
      throw err;
    }
  }

  async ensureInitialized() {
    await this.initialized;
  }

  async discoverAndSync() {
    await this.ensureInitialized();
    
    this.client.startDiscovery();
    
    // Wait for discovery window
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const lights = this.client.lights();
    for (const light of lights) {
      DB.upsertLight(light.id, light.label, light.address);
    }
    
    return DB.getLights();
  }

  async setLightState(id: string, params: { 
    power?: boolean, 
    color?: string, 
    brightness?: number, 
    kelvin?: number 
  }) {
    await this.ensureInitialized();
    
    // CHANGED: getLight(id) -> light(id)
    const light = this.client.light(id);
    if (!light) {
      throw new Error(`Light with ID ${id} not found`);
    }

    if (params.power === true) {
      await light.on();
    } else if (params.power === false) {
      await light.off();
    }

    if (params.color || params.brightness || params.kelvin) {
      const colorParams: any = {};
      
      if (params.color) {
        // Convert hex to RGB
        const hex = params.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        colorParams.color = [r, g, b];
      }
      
      if (params.brightness !== undefined) {
        colorParams.brightness = params.brightness;
      }
      
      if (params.kelvin !== undefined) {
        colorParams.kelvin = params.kelvin;
      }

      await light.color(colorParams);
    }

    return { success: true, id };
  }
}

export const lifxManager = new LifxManager();
