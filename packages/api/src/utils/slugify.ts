export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[āä]/g, 'a').replace(/[ēė]/g, 'e').replace(/[īį]/g, 'i')
    .replace(/[ōö]/g, 'o').replace(/[ūü]/g, 'u').replace(/[čć]/g, 'c')
    .replace(/[šś]/g, 's').replace(/[žź]/g, 'z').replace(/[ķ]/g, 'k')
    .replace(/[ļ]/g, 'l').replace(/[ņ]/g, 'n').replace(/[ģ]/g, 'g')
    .replace(/[ŗ]/g, 'r')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
