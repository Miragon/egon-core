import { BusinessObject } from "./businessObject";

export interface GroupBusinessObject extends BusinessObject {
    children: string[];
}
