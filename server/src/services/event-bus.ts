import { EventEmitter } from "events";

export interface GatewayEvent {
  type:
    | "session:qr"
    | "session:status"
    | "session:connected"
    | "session:disconnected"
    | "sessions:updated"
    | "message:received"
    | "message:queued"
    | "message:typing"
    | "message:sent"
    | "message:failed"
    | "message:deleted"
    | "erp:query_executed"
    | "webhook:dispatched"
    | "queue:updated";
  sessionId?: string;
  data: any;
  timestamp: string;
}

class GatewayEventBus extends EventEmitter {
  private static instance: GatewayEventBus;

  private constructor() {
    super();
    this.setMaxListeners(200);
  }

  public static getInstance(): GatewayEventBus {
    if (!GatewayEventBus.instance) {
      GatewayEventBus.instance = new GatewayEventBus();
    }
    return GatewayEventBus.instance;
  }

  public emitGatewayEvent(event: Omit<GatewayEvent, "timestamp">): void {
    const fullEvent: GatewayEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.emit("gateway_event", fullEvent);
    this.emit(fullEvent.type, fullEvent);
    if (fullEvent.sessionId) {
      this.emit(`session:${fullEvent.sessionId}`, fullEvent);
    }
  }

  public onGatewayEvent(listener: (event: GatewayEvent) => void): void {
    this.on("gateway_event", listener);
  }
}

export const eventBus = GatewayEventBus.getInstance();
