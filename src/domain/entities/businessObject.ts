export interface BusinessObject {
  id: string;
  name: string;

  type: string;

  x: number;
  y: number;
  height: number | undefined;
  width: number | undefined;
  pickedColor: string | undefined;
}
