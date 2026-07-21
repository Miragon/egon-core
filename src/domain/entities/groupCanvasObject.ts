import { CanvasObject } from './canvasObject';
import { GroupBusinessObject } from './groupBusinessObject';

export interface GroupCanvasObject extends CanvasObject {
  businessObject: GroupBusinessObject;
  children: CanvasObject[] | undefined;
}
