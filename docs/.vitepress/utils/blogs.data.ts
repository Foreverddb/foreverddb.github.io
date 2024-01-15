import {createContentLoader} from "vitepress";
import {BlogData, formatData} from "./data-formatter";

declare const data: BlogData;
export { data };
export default createContentLoader('blogs/**/*.md', {
    transform(data) {
        return formatData(data, 'year');
    },
});
