// Picks an icon for a category from its name, so new categories look right without any code change.
export function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/phone|tablet|mobile/, 'phone-portrait-outline'],
    [/laptop|computer|pc/, 'laptop-outline'],
    [/tv|television|electronic|audio|camera/, 'tv-outline'],
    [/fashion|cloth|wear|shoe|sneaker|bag/, 'shirt-outline'],
    [/beauty|health|care|cosmetic/, 'sparkles-outline'],
    [/kitchen|home|furniture|appliance/, 'home-outline'],
    [/food|grocer|drink/, 'restaurant-outline'],
    [/baby|kid|toy/, 'balloon-outline'],
    [/sport|fitness|gym/, 'barbell-outline'],
    [/car|vehicle|auto|motor/, 'car-sport-outline'],
    [/book|school|office|stationery/, 'book-outline'],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? 'pricetag-outline';
}
