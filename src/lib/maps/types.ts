export type MapPointAccuracy = "exact" | "district" | "city";

export type MapPoint = {
  id: string;
  slug: string;
  href: string;
  title: string;
  salary: string;
  districtName: string | null;
  address: string | null;
  lat: number;
  lng: number;
  accuracy: MapPointAccuracy;
  accuracyNote: string | null;
  navigatorHref: string;
};

export type MapCanvasProps = {
  points: MapPoint[];
  center: { lat: number; lng: number };
  zoom: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export type MapPageVariant = "full" | "lite" | "list";
export type MapInteractiveLibrary = "maplibre" | "yandex";
