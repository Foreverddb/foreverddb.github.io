<script setup lang="ts">
import gsap from 'gsap';
import {onMounted, onUnmounted, PropType, ref} from 'vue';
import * as DrawSVGPlugin from '../utils/DrawSVGPlugin';
import {TimeLine} from '../utils/data-formatter';
import {SVG_TEXTS} from '../utils/svg-texts';

const props = defineProps({
    timeline: {
        type: Object as PropType<TimeLine[]>,
        default: [],
    },
    height: {
        type: Number,
        default: 300,
    },
});

// 注册svg动画插件
gsap.registerPlugin(DrawSVGPlugin);

function getFirstControlPoints(rhs) {
    const n = rhs.length,
        x = [], // Solution vector.
        tmp = []; // Temp workspace.
    let b = 2.0;

    x[0] = rhs[0] / b;

    for (let i = 1; i < n; i++) { // Decomposition and forward substitution.
        tmp[i] = 1 / b;
        b = (i < n - 1 ? 4.0 : 2.0) - tmp[i];
        x[i] = (rhs[i] - x[i - 1]) / b;
    }

    for (let i = 1; i < n; i++) {
        x[n - i - 1] -= tmp[n - i] * x[n - i]; // Backsubstitution.
    }
    return x;
}

// 获取三次方贝塞尔曲线控制点坐标
function getCubicBezierCurvePoints(knots, firstControlPoints, secondControlPoints) {
    const rhs = [],
        n = knots.length - 1;
    let x, y, i;

    if (n < 1) {
        return;
    }

    // Set right hand side X values
    for (i = 0; i < n - 1; ++i) {
        rhs[i] = 4 * knots[i].x + 2 * knots[i + 1].x;
    }

    rhs[0] = knots[0].x + 2 * knots[1].x;
    rhs[n - 1] = 3 * knots[n - 1].x;

    // Get first control points X-values
    x = getFirstControlPoints(rhs);

    // Set right hand side Y values
    for (i = 1; i < n - 1; ++i) {
        rhs[i] = 4 * knots[i].y + 2 * knots[i + 1].y;
    }

    rhs[0] = knots[0].y + 2 * knots[1].y;
    rhs[n - 1] = 3 * knots[n - 1].y;

    // Get first control points Y-values
    y = getFirstControlPoints(rhs);

    for (i = 0; i < n; ++i) {
        // First control point
        firstControlPoints[i] = {
            x: x[i],
            y: y[i],
        };

        // Second control point
        if (i < n - 1) {
            secondControlPoints[i] = {
                x: 2 * knots[i + 1].x - x[i + 1],
                y: 2 * knots[i + 1].y - y[i + 1],
            };
        } else {
            secondControlPoints[i] = {
                x: (knots[n].x + x[n - 1]) / 2,
                y: (knots[n].y + y[n - 1]) / 2,
            };
        }
    }
}

/**
 * 获取三次方贝塞尔曲线路径
 * @param knots
 */
function getCubicBezierCurvePath(knots) {
    const firstControlPoints = [],
        secondControlPoints = [],
        path = [];

    getCubicBezierCurvePoints(knots, firstControlPoints, secondControlPoints);

    for (let i = 0, len = knots.length; i < len; i++) {
        if (i === 0) {
            path.push(['M', knots[i].x, knots[i].y].join(' '));
        } else {
            const firstControlPoint = firstControlPoints[i - 1],
                secondControlPoint = secondControlPoints[i - 1];

            path.push([
                'C', firstControlPoint.x, firstControlPoint.y, // 第一个控制点
                secondControlPoint.x, secondControlPoint.y, // 第二个控制点
                knots[i].x, knots[i].y, // 实点
            ].join(' '));
        }
    }

    return path.join(' ');
}

/**
 * 获取折线图的点
 */
function getPoints() {
    const height = props.height;
    const width = parseInt(
        getComputedStyle(svgRef.value).width,
    );
    // 上下留白缓冲区，防止折线超出svg范围
    const bufferSize = 20;

    const timeline = props.timeline;
    const len = timeline.length;
    const points: { x: number, y: number, time: string }[] = [
        {
            x: 0,
            y: height - bufferSize,
            time: '',
        },
    ];

    const startX = width * 0.2;
    const innerWidth = width * 0.6;
    const maxFrequency = Math.max(...timeline.map(item => item.frequency));
    timeline.forEach((item, index) => {
        points.push({
            x: startX + index * (innerWidth / (len - 1)),
            y: height - item.frequency / maxFrequency * (height - 2 * bufferSize) - bufferSize,
            time: timeline.map(x => x.time)[index],
        });
    });

    points.push({
        x: width,
        y: height - bufferSize,
        time: '',
    });
    return points;
}

const svgRef = ref<SVGSVGElement | null>();

const timelineDrawer = () => {
    document.querySelector('.svg-container .spline').setAttribute('d', '');

    const points = getPoints();

    const dots = document.querySelector('.svg-container .dots');
    const texts = document.querySelector('.svg-container .texts');
    dots.innerHTML = '';
    texts.innerHTML = '';

    for (const point of points) {
        const xmlns = "http://www.w3.org/2000/svg",
            circle = document.createElementNS(xmlns, 'circle');

        circle.setAttribute('fill', 'transparent');
        circle.setAttribute('stroke', 'url(#gradient)');
        circle.setAttribute('r', '4');
        circle.setAttribute('cx', point.x + '');
        circle.setAttribute('cy', point.y + '');
        circle.setAttribute('class', 'dot');
        dots.appendChild(circle);
    }

    for (const point of points) {
        const size = 16;
        if (!point.time) {
            continue;
        }

        const len = point.time.length;
        const xmlns = "http://www.w3.org/2000/svg",
            text = document.createElementNS(xmlns, 'svg');
        text.setAttribute('x', point.x - len * size / 2 + '');
        text.setAttribute('y', point.y + 3 + '');
        texts.appendChild(text);

        for (let i = 0; i < len; i++) {
            const letter = point.time[i];
            const xmlns = "http://www.w3.org/2000/svg",
                letterSvg = document.createElementNS(xmlns, 'svg');

            letterSvg.innerHTML = SVG_TEXTS[letter];

            letterSvg.setAttribute('x', i * size + '');
            letterSvg.setAttribute('y', '0');
            letterSvg.setAttribute('viewBox', '0 0 36 72');
            letterSvg.setAttribute('width', size + '');
            letterSvg.setAttribute('height', size * 2 + '');
            text.appendChild(letterSvg);
        }
    }

    const path = getCubicBezierCurvePath(points);
    document.querySelector('.svg-container .spline').setAttribute('d', path);
};

onMounted(() => {
    window.addEventListener('resize', timelineDrawer);

    timelineDrawer();

    const timeline = props.timeline;
    const len = timeline.length;

    gsap.timeline({
        repeat: 0,
        ease: 'power3.inOut',
    }).fromTo('.spline', {drawSVG: '0%'}, {duration: 3 * len, drawSVG: '100%'});

    gsap.timeline({
        repeat: 0,
        ease: 'power3.inOut',
    }).fromTo(document.querySelectorAll('.dot'),
        {drawSVG: '0%'},
        {
            duration: 2,
            drawSVG: '100%',
            stagger: {
                amount: 1.5,
                grid: "auto",
                from: "left",
            },
        },
    );

    gsap.timeline({
        repeat: 0,
        ease: 'power3.inOut',
    }).fromTo(document.querySelectorAll('.text'),
        {drawSVG: '0%'},
        {
            duration: 1,
            drawSVG: '100%',
            stagger: 0.5,
        },
    );
});

onUnmounted(() => {
    window.removeEventListener('resize', timelineDrawer);
});

</script>

<template>
    <div :style="{
        height: height + 'px',
    }" class="svg-container">
        <svg ref="svgRef" width="100%" height="100%">
            <defs>
                <filter id="fractal" filterUnits="objectBoundingBox" x="0%" y="0%" width="100%" height="100%">
                    <feTurbulence id="turbulence" type="fractalNoise" baseFrequency="0.01 0.01" numOctaves="10">
                        <animate
                            attributeName="baseFrequency"
                            dur="30s"
                            values="0.01 0.01;0.012 0.05;0.01 0.01;"
                            repeatCount="indefinite" />
                    </feTurbulence>
                    <feDisplacementMap in="SourceGraphic" scale="15"></feDisplacementMap>
                </filter>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f5628e"/>
                    <stop offset="50%" stop-color="#df5efe"/>
                    <stop offset="100%" stop-color="#7149f8"/>
                </linearGradient>
            </defs>
            <path class="spline" d=""
                  style="fill: none; stroke: url('#gradient'); stroke-linecap: round; stroke-linejoin: round; stroke-width: 1px;"></path>
            <g class="dots"></g>
            <g class="texts"></g>
        </svg>
    </div>
</template>

<style scoped>
.svg-container {
    width: 100%;
    position: absolute;
    z-index: -1;
    top: 0;
    left: 0;
    opacity: 0.6;
    filter: url(#fractal);
}
</style>