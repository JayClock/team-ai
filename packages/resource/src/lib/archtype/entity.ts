export interface Entity {
  description: Record<string, any>;
  relations: Record<string, Entity>;
}

