// 塔里木大学(taru.edu.cn) 拾光课程表适配脚本
// 基于正方教务系统接口适配
// 非该大学开发者适配,开发者无法及时发现问题
// 出现问题请提issues或者提交pr更改,这更加快速

/**
 * 解析周次字符串，处理单双周和周次范围。
 */
function parseWeeks(weekStr) {
    if (!weekStr) return [];

    const weekSets = weekStr.split(',');
    let weeks = [];

    for (const set of weekSets) {
        const trimmedSet = set.trim();

        const rangeMatch = trimmedSet.match(/(\d+)-(\d+)周/);
        const singleMatch = trimmedSet.match(/^(\d+)周/); // 匹配以数字周结束的

        let start = 0;
        let end = 0;
        let processed = false;

        if (rangeMatch) { // 范围, 如 "1-5周"
            start = Number(rangeMatch[1]);
            end = Number(rangeMatch[2]);
            processed = true;
        } else if (singleMatch) { // 单个周, 如 "6周"
             start = end = Number(singleMatch[1]);
             processed = true;
        }
        
        if (processed) {
            // 确定单双周
            const isSingle = trimmedSet.includes('(单)');
            const isDouble = trimmedSet.includes('(双)');

            for (let w = start; w <= end; w++) {
                if (isSingle && w % 2 === 0) continue; // 单周跳过偶数
                if (isDouble && w % 2 !== 0) continue; // 双周跳过奇数
                weeks.push(w);
            }
        }
    }

    // 去重并排序
    return [...new Set(weeks)].sort((a, b) => a - b);
}

/**
 * 解析 API 返回的 JSON 数据。
 */
function parseJsonData(jsonData) {
    console.log("JS: parseJsonData 正在解析 JSON 数据...");
    
    // 检查JSON结构：新的数据在 kbList 字段中
    if (!jsonData || !Array.isArray(jsonData.kbList)) {
        console.warn("JS: JSON 数据结构错误或缺少 kbList 字段。");
        return []; 
    }

    const rawCourseList = jsonData.kbList;
    const finalCourseList = [];

    for (const rawCourse of rawCourseList) {
        // 关键字段检查： kcmc(课名), xm(教师), cdmc(教室), xqj(星期), jcs(节次范围), zcd(周次描述)
        if (!rawCourse.kcmc || !rawCourse.xm || !rawCourse.cdmc || 
            !rawCourse.xqj || !rawCourse.jcs || !rawCourse.zcd) {
            continue;
        }

        const weeksArray = parseWeeks(rawCourse.zcd);
        
        // 周次有效性检查
        if (weeksArray.length === 0) {
            continue;
        }
        
        // 解析节次范围，例如 "1-2"
        const sectionParts = rawCourse.jcs.split('-');
        const startSection = Number(sectionParts[0]);
        const endSection = Number(sectionParts[sectionParts.length - 1]); 

        const day = Number(rawCourse.xqj); // xqj: 星期几 (周一为1, 周日为7)
        
        // 数字有效性检查
        if (isNaN(day) || isNaN(startSection) || isNaN(endSection) || day < 1 || day > 7 || startSection > endSection) {
            // console.warn(`JS: 课程 ${rawCourse.kcmc} 星期或节次数据无效，跳过。`);
            continue;
        }

        finalCourseList.push({
            name: rawCourse.kcmc.trim(),
            teacher: rawCourse.xm.trim(),
            position: rawCourse.cdmc.trim(),
            day: day, 
            startSection: startSection,
            endSection: endSection, 
            weeks: weeksArray
        });
    }

    finalCourseList.sort((a, b) =>
        a.day - b.day ||
        a.startSection - b.startSection ||
        a.name.localeCompare(b.name)
    );
    
    console.log(`JS: JSON 数据解析完成，共找到 ${finalCourseList.length} 门课程。`);
    return finalCourseList;
}

/**
 * 检查是否在登录页面。
 * 只有当 URL 精确匹配 'https://jwgl.taru.edu.cn/jwglxt/xtgl/login_slogin.html' 时，才返回 true。
 */
function isLoginPage() {
    const url = window.location.href;
    const loginUrl = "https://jwgl.taru.edu.cn/jwglxt/xtgl/login_slogin.html";
    
    // 如果当前 URL 与指定的登录 URL 完全一致，则返回 true (是登录页)
    return url === loginUrl; 
}


function validateYearInput(input) {
    console.log("JS: validateYearInput 被调用，输入: " + input);
    if (/^[0-9]{4}$/.test(input)) {
        console.log("JS: validateYearInput 验证通过。");
        return false;
    } else {
        console.log("JS: validateYearInput 验证失败。");
        return "请输入四位数字的学年！";
    }
}

async function promptUserToStart() {
    console.log("JS: 流程开始：显示公告。");
    return await window.AndroidBridgePromise.showAlert(
        "教务系统课表导入",
        "导入前请确保您已在浏览器中成功登录教务系统",
        "好的，开始导入"
    );
}

async function getAcademicYear() {
    const currentYear = new Date().getFullYear().toString();
    console.log("JS: 提示用户输入学年。");
    return await window.AndroidBridgePromise.showPrompt(
        "选择学年",
        "请输入要导入课程的学年（例如 2025）:",
        currentYear,
        "validateYearInput"
    );
}

async function selectSemester() {
    const semesters = ["第一学期", "第二学期"];
    console.log("JS: 提示用户选择学期。");
    const semesterIndex = await window.AndroidBridgePromise.showSingleSelection(
        "选择学期",
        JSON.stringify(semesters),
        0
    );
    return semesterIndex;
}

/**
 * 将选择索引转换为 API 所需的学期码。
 */
function getSemesterCode(semesterIndex) {
    // semesterIndex 3 (第一学期), 12 (第二学期)
    return semesterIndex === 0 ? "3" : "12";
}


/**
 * 请求和解析课程数据
 */
async function fetchAndParseCourses(academicYear, semesterIndex) {
    AndroidBridge.showToast("正在请求课表数据...");

    const semesterCode = getSemesterCode(semesterIndex);
    
    // API URL 和请求体
    // xnm=学年, xqm=学期码 (3/12)
    const xnmXqmBody = `xnm=${academicYear}&xqm=${semesterCode}`; 
    const url = "https://jwgl.taru.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151";

    console.log(`JS: 发送请求到 ${url}, body: ${xnmXqmBody}`);

    const requestOptions = {
        "headers": {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8", 
        },
        "body": xnmXqmBody,
        "method": "POST",
        "credentials": "include"
    };

    try {
        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            throw new Error(`网络请求失败。状态码: ${response.status} (${response.statusText})`);
        }
        
        const jsonText = await response.text();
        let jsonData;
        try {
            jsonData = JSON.parse(jsonText);
        } catch (e) {
            console.error('JS: JSON 解析失败，可能是会话过期:', e);
            AndroidBridge.showToast("数据返回格式错误，可能是您未成功登录或会话已过期。");
            return null;
        }

        const courses = parseJsonData(jsonData); 

        if (courses.length === 0) {
            AndroidBridge.showToast("未找到任何课程数据，请检查所选学年学期是否正确或本学期无课，或教务系统需要二次登录。");
            return null;
        }

        console.log(`JS: 课程数据解析成功，共找到 ${courses.length} 门课程。`);

        return { courses: courses };

    } catch (error) {
        AndroidBridge.showToast(`请求或解析失败: ${error.message}`);
        console.error('JS: Fetch/Parse Error:', error);
        return null;
    }
}

async function saveCourses(parsedCourses) {
    AndroidBridge.showToast(`正在保存 ${parsedCourses.length} 门课程...`);
    console.log(`JS: 尝试保存 ${parsedCourses.length} 门课程...`);
    try {
        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(parsedCourses, null, 2));
        console.log("JS: 课程保存成功！");
        return true;
    } catch (error) {
        AndroidBridge.showToast(`课程保存失败: ${error.message}`);
        console.error('JS: Save Courses Error:', error);
        return false;
    }
}

const Non_summerTimeSlots = [
    { number: 1, startTime: "10:05", endTime: "10:50" },
    { number: 2, startTime: "11:00", endTime: "11:45" },
    { number: 3, startTime: "12:10", endTime: "12:55" },
    { number: 4, startTime: "13:05", endTime: "13:50" },
    { number: 5, startTime: "16:05", endTime: "16:50" },
    { number: 6, startTime: "17:00", endTime: "17:45" },
    { number: 7, startTime: "18:10", endTime: "18:55" },
    { number: 8, startTime: "19:05", "endTime": "19:50" },
    { number: 9, startTime: "21:00", "endTime": "21:45" },
    { number: 10, startTime: "21:55", "endTime": "22:40" }
];
const SummerTimeSlots = [
    { number: 1, startTime: "09:35", endTime: "10:20" },
    { number: 2, startTime: "10:30", endTime: "11:15" },
    { number: 3, startTime: "11:40", endTime: "12:25" },
    { number: 4, startTime: "12:35", endTime: "13:20" },
    { number: 5, startTime: "16:35", endTime: "17:20" },
    { number: 6, startTime: "17:30", endTime: "18:15" },
    { number: 7, startTime: "18:40", endTime: "19:25" },
    { number: 8, startTime: "19:35", "endTime": "20:20" },
    { number: 9, startTime: "21:30", "endTime": "22:15" },
    { number: 10, startTime: "22:25", "endTime": "23:10" }
];

async function selectTimeSlotsType() {
    const timeSlotsOptions = ["非夏季作息", "夏季作息"];
    console.log("JS: 提示用户选择作息时间类型。");
    const selectedIndex = await window.AndroidBridgePromise.showSingleSelection(
        "选择作息时间",
        JSON.stringify(timeSlotsOptions),
        0
    );
    return selectedIndex;
}

async function importPresetTimeSlots(timeSlots) {
    console.log(`JS: 准备导入 ${timeSlots.length} 个预设时间段。`);

    if (timeSlots.length > 0) {
        AndroidBridge.showToast(`正在导入 ${timeSlots.length} 个预设时间段...`);
        try {
            await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(timeSlots));
            AndroidBridge.showToast("预设时间段导入成功！");
            console.log("JS: 预设时间段导入成功。");
        } catch (error) {
            AndroidBridge.showToast("导入时间段失败: " + error.message);
            console.error('JS: Save Time Slots Error:', error);
        }
    } else {
        AndroidBridge.showToast("警告：时间段为空，未导入时间段信息。");
        console.warn("JS: 警告：传入时间段为空，未导入时间段信息。");
    }
}


async function runImportFlow() {
    if (isLoginPage()) {
        AndroidBridge.showToast("导入失败：请先登录教务系统！");
        console.log("JS: 检测到当前在登录页面，终止导入。");
        return;
    }

    // 1. 公告和前置检查。
    const alertConfirmed = await promptUserToStart();
    if (!alertConfirmed) {
        AndroidBridge.showToast("用户取消了导入。");
        console.log("JS: 用户取消了导入流程。");
        return;
    }

    const academicYear = await getAcademicYear();
    if (academicYear === null) {
        AndroidBridge.showToast("导入已取消。");
        console.log("JS: 获取学年失败/取消，流程终止。");
        return;
    }
    console.log(`JS: 已选择学年: ${academicYear}`);


    const semesterIndex = await selectSemester();
    if (semesterIndex === null || semesterIndex === -1) {
        AndroidBridge.showToast("导入已取消。");
        console.log("JS: 选择学期失败/取消，流程终止。");
        return;
    }
    console.log(`JS: 已选择学期索引: ${semesterIndex}`);

    // 2. 获取并解析课程
    const result = await fetchAndParseCourses(academicYear, semesterIndex);
    if (result === null) {
        console.log("JS: 课程获取或解析失败，流程终止。");
        return;
    }
    const { courses } = result;

    // 3. 课程数据保存。
    const saveResult = await saveCourses(courses);
    if (!saveResult) {
        console.log("JS: 课程保存失败，流程终止。");
        return;
    }

    // 4. 作息时间选择与导入
    const timeSlotsIndex = await selectTimeSlotsType();
    let selectedTimeSlots = [];

    if (timeSlotsIndex === 0) {
        // 0: 非夏季作息
        selectedTimeSlots = Non_summerTimeSlots;
        console.log("JS: 已选择非夏季作息。");
    } else if (timeSlotsIndex === 1) {
        // 1: 夏季作息
        selectedTimeSlots = SummerTimeSlots;
        console.log("JS: 已选择夏季作息。");
    } else {
        selectedTimeSlots = Non_summerTimeSlots;
        console.warn("JS: 作息时间选择失败/取消，使用非夏季作息作为默认值。");
    }
    await importPresetTimeSlots(selectedTimeSlots);


    AndroidBridge.showToast(`课程导入成功，共导入 ${courses.length} 门课程！`);
    console.log("JS: 整个导入流程执行完毕并成功。");
    AndroidBridge.notifyTaskCompletion();
}

runImportFlow();