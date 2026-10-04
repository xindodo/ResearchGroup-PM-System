import { reactive } from 'vue'

export const detailTabs = [
  { id: 'project_overview', label: '概览' },
  { id: 'project_tasks', label: '里程碑与任务' },
  { id: 'project_timesheets', label: '工日表' },
  { id: 'project_gantt', label: '甘特图' },
  { id: 'project_activity', label: '项目过程' },
  { id: 'project_risks', label: '风险与问题' },
  { id: 'project_approvals', label: '审批与变更' },
  { id: 'project_notes', label: '备注' },
] as const

export type DetailGroup = (typeof detailTabs)[number]['id'] | 'project_milestones' | 'project_participants' | 'project_files' | 'project_discussions'

export type ProjectCore = {
  id: string
  title: string
  code: string
  type: string
  unit: string
  owner: string
  phase: string
  progress: number
  due: string
  status: string
  summary: string
  ownerId?: string
  studentOwnerId?: string
  memberIds?: string[]
  memberRoles?: string[]
}

type DetailSeed = {
  goal: string
  start: string
  end: string
  sponsor: string
  partner: string
  coordinator: string
  team: [string, string, string]
  taskTitles: [string, string, string, string, string]
  milestoneTitles: [string, string, string, string, string]
  documentTitles: [string, string, string, string]
  riskTitle: string
  discussion: string
  note: string
}

const seeds: Record<string, DetailSeed> = {
  bridge: {
    goal: '建立桥梁群结构状态评估方法，形成现场监测、预警分析和韧性提升的成套成果。',
    start: '2026-03-12', end: '2026-12-15', sponsor: '省重点研发计划', partner: '武汉桥梁科学研究院', coordinator: '刘悦', team: ['陈明', '刘悦', '孙卓'],
    taskTitles: ['现场监测方案确认', '传感器布设与数据接入', '连续观测与模型校准', '提交中期检查材料', '形成成果验收报告'],
    milestoneTitles: ['项目立项', '技术方案评审', '现场试验完成', '中期检查', '成果验收'],
    documentTitles: ['桥梁群健康监测技术方案.pdf', '现场监测点位布设图.pdf', '连续观测数据汇总.xlsx', '中期检查材料目录.docx'],
    riskTitle: '连续观测数据存在短时缺口', discussion: '现场数据回传频率已统一为每 15 分钟一次，缺口数据请在本周内补采。', note: '中期检查前需由合作单位共同确认模型校准结果。',
  },
  corridor: {
    goal: '完成示范走廊路侧感知、信号协同与平台联调，支撑分阶段建设和验收。',
    start: '2026-02-18', end: '2027-03-30', sponsor: '市交通建设中心', partner: '东湖高新区建设局', coordinator: '黄涛', team: ['周岚', '黄涛', '陈明'],
    taskTitles: ['施工图与接口清单确认', '路侧设备安装', '信号控制接口联调', '组织路段试运行', '提交阶段验收资料'],
    milestoneTitles: ['项目启动', '施工图审定', '设备安装完成', '接口联调', '阶段验收'],
    documentTitles: ['示范走廊施工组织方案.pdf', '信号控制接口清单.xlsx', '路侧设备安装记录.pdf', '阶段验收资料目录.docx'],
    riskTitle: '信号控制接口交付延迟', discussion: '接口清单第三版已发给建设单位，请确认四处路口的信号配时字段。', note: '施工窗口需提前两周与交警及属地单位协调。',
  },
  network: {
    goal: '统一跨省数据口径，提出区域综合交通协同发展的技术方案和实施路径。',
    start: '2026-06-01', end: '2027-01-20', sponsor: '三省联合工作组', partner: '鄂湘赣协作单位', coordinator: '赵宁', team: ['李睿', '赵宁', '何静'],
    taskTitles: ['联合工作机制确认', '跨省数据口径对齐', '交通需求分析', '组织方案联合评审', '提交综合研究报告'],
    milestoneTitles: ['任务书确认', '资料收集', '数据口径统一', '方案评审', '报告提交'],
    documentTitles: ['区域交通协同研究任务书.pdf', '跨省数据字典.xlsx', '交通需求分析初稿.docx', '方案评审意见汇总.pdf'],
    riskTitle: '跨省数据口径尚未统一', discussion: '货运 OD 数据的统计周期建议统一到自然月，请各单位核对可提供范围。', note: '所有对外提交材料须由三省牵头单位共同确认版本。',
  },
  materials: {
    goal: '建立绿色道路材料全寿命周期评价指标，完成试验验证和工程应用建议。',
    start: '2026-04-06', end: '2027-02-28', sponsor: '校企联合研究计划', partner: '华中道路材料研究院', coordinator: '郑怡', team: ['陈明', '郑怡', '高扬'],
    taskTitles: ['评价指标体系确定', '材料样品制备', '环境与性能数据采集', '中期成果分析', '形成应用指南'],
    milestoneTitles: ['项目立项', '指标体系评审', '试验数据采集', '中期汇报', '应用指南提交'],
    documentTitles: ['绿色道路材料评价方案.pdf', '试验样品台账.xlsx', '环境影响数据汇总.xlsx', '中期成果汇报.pptx'],
    riskTitle: '部分材料样品试验周期延长', discussion: '第二批样品已进场，耐久性数据会在下一轮试验后补齐。', note: '评价指标体系与试验台账需保持同一版本编号。',
  },
}

function previewProjectDetail(project: ProjectCore) {
  const seed = seeds[project.id] || seeds.bridge!
  const taskStates = ['已完成', '已完成', '进行中', '待开始', '待开始']
  const taskProgress = [100, 100, project.progress, 0, 0]
  const taskDates = ['2026-06-18', '2026-08-22', '2026-10-08', '2026-10-18', seed.end]
  const tasks = seed.taskTitles.map((title, index) => ({
    id: `${project.code}-T${String(index + 1).padStart(2, '0')}`,
    title, parentId: index === 3 ? `${project.code}-T03` : null,
    owner: seed.team[index % 3]!, due: taskDates[index]!, state: taskStates[index]!, progress: taskProgress[index]!,
    dependsOn: index === 0 ? '—' : `T${String(index).padStart(2, '0')}`,
  }))
  const milestoneStates = ['已完成', '已完成', '进行中', '待开始', '待开始']
  const milestoneDates = [seed.start, '2026-06-18', '2026-09-30', '2026-10-18', seed.end]
  const milestones = seed.milestoneTitles.map((title, index) => ({
    title, planned: milestoneDates[index]!, actual: index < 2 ? milestoneDates[index]! : '—',
    deliverable: index === 4 ? '最终成果与验收意见' : index === 3 ? '阶段报告与评审意见' : index === 2 ? '试验或实施记录' : '会议纪要与确认文件',
    state: milestoneStates[index]!, owner: seed.team[index % 3]!,
  }))
  const units = [
    { name: project.unit.split(' · ')[0]!, role: '牵头单位', contact: project.owner, duty: '统筹进度、成果交付与对外沟通' },
    { name: seed.partner, role: '协作单位', contact: seed.coordinator, duty: '承担专题任务和资料审核' },
    { name: project.type === '跨单位项目' ? '联合数据工作组' : '项目实施团队', role: '执行团队', contact: seed.team[2], duty: '现场实施、数据归集与文档维护' },
  ]
  const files = seed.documentTitles.map((name, index) => ({
    name, category: ['项目文件', '技术资料', '过程记录', '阶段成果'][index]!, version: ['v1.0', 'v2.1', 'v1.3', 'v0.9'][index]!,
    owner: seed.team[index % 3]!, updated: ['09月22日', '09月27日', '09月29日', '09月30日'][index]!,
  }))
  const timesheets = [
    { date: '09月29日', person: seed.team[0], task: seed.taskTitles[2], hours: 7.5, state: '已确认' },
    { date: '09月28日', person: seed.team[1], task: seed.taskTitles[2], hours: 6, state: '已确认' },
    { date: '09月27日', person: seed.team[2], task: seed.taskTitles[1], hours: 5.5, state: '待确认' },
    { date: '09月26日', person: seed.team[0], task: seed.taskTitles[3], hours: 4, state: '已确认' },
  ]
  const discussions = [
    { title: '本周协作事项确认', author: project.owner, date: '09月29日 16:40', body: seed.discussion, replies: 3 },
    { title: '阶段材料提交安排', author: seed.coordinator, date: '09月26日 10:15', body: `${seed.taskTitles[3]}所需材料请统一放入项目文件区，提交前核对版本。`, replies: 2 },
  ]
  const notes = [
    { title: '重要提醒', body: seed.note, author: project.owner, date: '09月30日', pinned: true },
    { title: '会议准备', body: `下次例会重点确认“${seed.taskTitles[2]}”的完成情况和后续分工。`, author: seed.coordinator, date: '09月27日', pinned: false },
  ]
  const activities = [
    { date: '今天 09:42', person: project.owner, action: '更新项目阶段', detail: `当前阶段调整为“${project.phase}”`, kind: '阶段' },
    { date: '昨天 16:18', person: seed.coordinator, action: '更新任务进度', detail: `${seed.taskTitles[2]}：${Math.max(project.progress - 12, 0)}% → ${project.progress}%`, kind: '任务' },
    { date: '09月27日 11:06', person: seed.team[2], action: '上传文件新版本', detail: `${seed.documentTitles[1]} · v2.1`, kind: '文件' },
    { date: '09月25日 14:30', person: project.owner, action: '记录项目风险', detail: seed.riskTitle, kind: '风险' },
  ]
  const risks = [
    { title: seed.riskTitle, level: project.status === '正常推进' ? '中' : '高', owner: seed.coordinator, state: '处理中', response: '已指定责任人，下一次例会复核处理进展。' },
    { title: '跨团队材料确认可能影响节点', level: '低', owner: project.owner, state: '持续观察', response: '提前发送材料目录并明确确认时限。' },
  ]
  const approvals = [
    { title: '阶段计划调整', applicant: project.owner, submitted: '09月28日', state: '审批中', detail: `申请将“${seed.milestoneTitles[3]}”所需材料补充至计划。` },
    { title: '技术方案版本确认', applicant: seed.coordinator, submitted: '09月21日', state: '已通过', detail: '确认协作单位提交的技术资料版本。' },
  ]
  return { ...seed, tasks, milestones, units, files, timesheets, discussions, notes, activities, risks, approvals }
}

export type ProjectDetailData = Omit<ReturnType<typeof previewProjectDetail>, 'team' | 'tasks'> & { team: string[]; tasks: (ReturnType<typeof previewProjectDetail>['tasks'][number] & { assigneeId?: string; taskType?: string })[] }
export const realProjectDetails = reactive(new Map<string, ProjectDetailData>())
export function projectDetail(project: ProjectCore): ProjectDetailData {
  return realProjectDetails.get(project.id) || previewProjectDetail(project)
}
