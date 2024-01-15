import dayjs from "dayjs";
import {ContentData} from "vitepress";

export interface TimeLine {
    time: string;
    frequency: number;
}

export interface BlogDataItem {
    url: string;
    frontmatter: Record<string, string>;
    date: string;
    tags: string[];
    title: string;
    brief: string;
    category: string;
}

export interface BlogData {
    tags: string[];
    timeLine: TimeLine[];
    data: BlogDataItem[];
    categories: string[];
}

export function formatDate(date: string, timeType: 'year' | 'month') {
    const dateObj = date ? dayjs(date) : dayjs();
    return {
        date: dateObj.format('YYYY-MM-DD'),
        timeline: dateObj.format(timeType === 'year' ? 'YYYY' : 'YYYY-MM'),
    };
}

export function formatData(data: ContentData[], timeType: 'year' | 'month'): BlogData {
    const tagSet = new Set<string>();
    const categorySet = new Set<string>();
    const timeMap = new Map<string, number>();

    const dataList = data.filter((item) => /.html/.test(item.url) && !item.frontmatter.hidden)
        .map(({url, frontmatter}) => {
            const {tags, date} = frontmatter;

            if (Array.isArray(tags)) {
                tags.forEach((tag: string) => {
                    tagSet.add(tag);
                });
            }

            const dateObj = formatDate(date, timeType);
            if (!timeMap.has(dateObj.timeline)) {
                timeMap.set(dateObj.timeline, 1);
            } else {
                timeMap.set(dateObj.timeline, (timeMap.get(dateObj.timeline) || 0) + 1);
            }

            categorySet.add(frontmatter.category || '');

            return {
                url,
                frontmatter,
                date: dateObj.date,
                tags: tags || [],
                title: frontmatter.title,
                brief: frontmatter.brief || '',
                category: frontmatter.category || '',
            };
        }).sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix());

    const timeList: TimeLine[] = [];
    timeMap.forEach((value, key) => {
        timeList.push({
            time: key,
            frequency: value,
        });
    });

    return {
        tags: Array.from(tagSet),
        timeLine: timeList.sort((a, b) => dayjs(a.time).unix() - dayjs(b.time).unix()),
        data: dataList,
        categories: Array.from(categorySet),
    };
}
