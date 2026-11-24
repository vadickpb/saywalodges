import type { InventoryCategory } from "@/lib/domain/inventory";

export type InventoryText = {
  tab: string;
  title: string;
  intro: string;
  chooseLocation: string;
  unitWhole: string;
  propertyWide: string;
  commonArea: string;
  space: string;
  reviewReassign: string;
  empty: string;
  setupFirst: string;
  noProperty: string;
  offline: string;
  add: string;
  edit: string;
  save: string;
  saving: string;
  cancel: string;
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  nameEs: string;
  nameEn: string;
  quantity: string;
  category: string;
  note: string;
  consumable: string;
  guestVisible: string;
  visible: string;
  hidden: string;
  hideAction: string;
  showAction: string;
  moveUp: string;
  moveDown: string;
  quickAdd: string;
  quickHelp: string;
  quickPlaceholder: string;
  addLines: string;
  copy: string;
  copyHelp: string;
  copyTo: string;
  copySubmit: string;
  cost: string;
  amount: string;
  clearCostHelp: string;
  saved: string;
  savedCount: string;
  categoryLabels: Record<InventoryCategory, string>;
};

export const inventoryDictionary: Record<"es" | "en", InventoryText> = {
  es: {
    tab: "Inventario",
    title: "Inventario de la propiedad",
    intro: "Registra lo que hay en cada unidad, espacio o área común. Los nombres de las unidades se muestran tal como los configuraste.",
    chooseLocation: "Unidad o espacio",
    unitWhole: "Unidad completa",
    propertyWide: "Sin espacio (revisar)",
    commonArea: "Área común",
    space: "Espacio",
    reviewReassign: "Reasigna estos objetos",
    empty: "Todavía no hay objetos en esta ubicación.",
    setupFirst: "Configura primero una unidad o un espacio para empezar el inventario.",
    noProperty: "No tienes una propiedad activa.",
    offline: "Sin conexión. Intenta de nuevo.",
    add: "Agregar objeto",
    edit: "Editar",
    save: "Guardar objeto",
    saving: "Guardando…",
    cancel: "Cancelar",
    delete: "Eliminar",
    deleteTitle: "¿Eliminar este objeto?",
    deleteDescription: "Se eliminará del inventario. Esta acción no se puede deshacer.",
    nameEs: "Nombre en español",
    nameEn: "Nombre en inglés",
    quantity: "Cantidad",
    category: "Categoría",
    note: "Nota interna",
    consumable: "Consumible",
    guestVisible: "Visible para el huésped",
    visible: "Visible",
    hidden: "Oculto al huésped",
    hideAction: "Ocultar",
    showAction: "Mostrar",
    moveUp: "Subir",
    moveDown: "Bajar",
    quickAdd: "Carga rápida",
    quickHelp: "Una línea por objeto. Escribe, por ejemplo, “12 platos” o “licuadora”.",
    quickPlaceholder: "12 platos\n6 vasos\nlicuadora",
    addLines: "Agregar líneas",
    copy: "Copiar inventario",
    copyHelp: "Copia los objetos y sus ajustes operativos. Los costos privados no se copian.",
    copyTo: "Copiar a",
    copySubmit: "Copiar objetos",
    cost: "Costo de reposición",
    amount: "Monto",
    clearCostHelp: "Deja el monto vacío para borrar el costo.",
    saved: "Guardado",
    savedCount: "{count} objetos guardados",
    categoryLabels: {
      kitchen: "Cocina", bedding: "Ropa de cama", bath: "Baño", appliances: "Electrodomésticos", furniture: "Muebles",
      decor: "Decoración", outdoor: "Exterior", games: "Juegos", safety: "Seguridad", other: "Otros",
    },
  },
  en: {
    tab: "Inventory",
    title: "Property inventory",
    intro: "Track what belongs in each unit, space, or common area. Unit names are shown exactly as configured.",
    chooseLocation: "Unit or space",
    unitWhole: "Whole unit",
    propertyWide: "No space (review)",
    commonArea: "Common area",
    space: "Space",
    reviewReassign: "Reassign these items",
    empty: "There are no items in this location yet.",
    setupFirst: "Set up a unit or space before starting the inventory.",
    noProperty: "You do not have an active property.",
    offline: "You are offline. Try again.",
    add: "Add item",
    edit: "Edit",
    save: "Save item",
    saving: "Saving…",
    cancel: "Cancel",
    delete: "Delete",
    deleteTitle: "Delete this item?",
    deleteDescription: "It will be removed from the inventory. This cannot be undone.",
    nameEs: "Spanish name",
    nameEn: "English name",
    quantity: "Quantity",
    category: "Category",
    note: "Internal note",
    consumable: "Consumable",
    guestVisible: "Visible to guests",
    visible: "Visible",
    hidden: "Hidden from guests",
    hideAction: "Hide",
    showAction: "Show",
    moveUp: "Move up",
    moveDown: "Move down",
    quickAdd: "Quick add",
    quickHelp: "Enter one item per line, for example “12 plates” or “blender”.",
    quickPlaceholder: "12 plates\n6 glasses\nblender",
    addLines: "Add lines",
    copy: "Copy inventory",
    copyHelp: "Copies items and operational settings. Private costs are not copied.",
    copyTo: "Copy to",
    copySubmit: "Copy items",
    cost: "Replacement cost",
    amount: "Amount",
    clearCostHelp: "Leave the amount empty to remove the cost.",
    saved: "Saved",
    savedCount: "{count} items saved",
    categoryLabels: {
      kitchen: "Kitchen", bedding: "Bedding", bath: "Bathroom", appliances: "Appliances", furniture: "Furniture",
      decor: "Decor", outdoor: "Outdoor", games: "Games", safety: "Safety", other: "Other",
    },
  },
};

export type InventoryLocale = keyof typeof inventoryDictionary;
