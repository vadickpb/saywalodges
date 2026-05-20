import { getSpaces, SPACE_CATEGORIES } from "@/lib/spaces";
import Spaces from "@/components/Spaces";
import type { Dict } from "@/dictionaries";

type Props = { dict: Dict["spaces"]; lang: string };

export default async function SpacesSection({ dict, lang }: Props) {
  const spaces = await getSpaces();
  return (
    <Spaces
      spaces={spaces}
      categories={SPACE_CATEGORIES}
      lang={lang}
      dict={dict}
    />
  );
}
