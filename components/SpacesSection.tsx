import { getSpaces, SPACE_CATEGORIES } from "@/lib/spaces";
import Spaces from "@/components/Spaces";
import type { Dict } from "@/dictionaries";

type Props = { dict: Dict["spaces"]; lang: string; propertyId: string; name: string };

export default async function SpacesSection({ dict, lang, propertyId, name }: Props) {
  const spaces = await getSpaces(propertyId);
  return (
    <Spaces
      spaces={spaces}
      categories={SPACE_CATEGORIES}
      lang={lang}
      dict={dict}
      name={name}
    />
  );
}
