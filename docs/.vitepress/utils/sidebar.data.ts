import * as path from 'path';
import matter from 'gray-matter';
import * as fs from 'fs';

interface SidebarData {
    text: string;
    link?: string;
    items?: SidebarData[];
}

export default function (sidebarPath: string): SidebarData[] {
    const dir = path.join(process.cwd(), sidebarPath);
    const linkDir = "/blogs";
    const files = fs.readdirSync(dir);

    const categoryMap = new Map<string, SidebarData[]>();

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (!fs.statSync(filePath).isDirectory()) {
            const {data = {}} = matter.read(filePath);
            const {title, category} = data;
            const link = `${linkDir}/${file.replace(/\.md$/, '.html')}`;
            const sidebarData: SidebarData = {
                text: title || file.replace(/\.md$/, ''),
                link,
            };
            if (category) {
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, [sidebarData]);
                } else {
                    categoryMap.get(category)?.push(sidebarData);
                }
            } else {
                if (!categoryMap.has('未分类')) {
                    categoryMap.set('未分类', [sidebarData]);
                } else {
                    categoryMap.get('未分类')?.push(sidebarData);
                }
            }
        }
    }
    return Array.from(categoryMap.entries()).map(([key, value]) => {
        return {
            text: key,
            items: value,
        };
    });
}
