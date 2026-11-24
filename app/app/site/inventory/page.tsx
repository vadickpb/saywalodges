import { InventoryEditor } from "@/components/dashboard/inventory-editor";
import { Card, CardContent } from "@/components/ui/card";
import { inventoryDictionary } from "@/dictionaries/inventory";
import { getInventoryEditorData } from "@/lib/dal/inventory";

export default async function InventoryPage() {
  const data = await getInventoryEditorData();
  if (!data) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{inventoryDictionary.es.noProperty}</CardContent></Card>;
  }
  return <InventoryEditor data={data} text={inventoryDictionary.es} />;
}
