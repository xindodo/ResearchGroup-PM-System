import { reactive } from 'vue'
export type Kind = 'materials' | 'achievements' | 'students' | 'projects' | 'news' | 'development' | 'teaching' | 'daily' | 'research'
export interface Attachment { name: string; data: string; type: string; size: number }
export interface RecordItem {
  advisor?: string;
  creator?: string; state?: string; revision?: number; reviewNote?: string; createdAt?: string; updatedAt?: string;
  id: string; kind: Kind; title: string; category: string; owner: string;
  major: string; version: string; year: string; level: string; source: string;
  achievementSource?: string; achievementGrade?: string;
  start: string; end: string; summary: string; course: string; courseCode: string;
  courseType: string; credits: string; hours: string; theory: string; practice: string;
  materialStatus: string; attachments: Attachment[]; images?: Attachment[]; participants?: string[];
}
export const definitions = reactive({
  students: { title: '学生成果', noun: '成果', subtitle: '', categories: ['学生竞赛', '学生项目', '荣誉称号'] },
  daily: { title: '工作日常', noun: '记录', subtitle: '', categories: ['课堂实录', '实习实践', '生活团建'] },
  research: { title: '科研成果', noun: '成果', subtitle: '', categories: ['论文', '专利', '软件成果', '获奖与荣誉', '数据集', '学位论文', '学术活动'] },
  news: { title: '新闻动态', noun: '新闻', subtitle: '', categories: ['教务通知', '教学成果', '科研动态', '学术交流'] },
  development: { title: '教学提升', noun: '活动', subtitle: '', categories: ['培训交流', '团队建设', '专业建设'] },
  teaching: { title: '教学工作', noun: '工作', subtitle: '', categories: ['学校工作', '学院工作', '交工系工作'] },
  materials: { title: '教学资料', noun: '资料', subtitle: '统一管理培养方案、课程大纲与教学文件', categories: ['培养方案', '课程大纲', '教学日历', '实践教学资料', '实验教学资料', '教学课件', '教学管理文件'] },
  achievements: { title: '教学成果', noun: '成果', subtitle: '汇集专业建设、教学改革与师生竞赛成果', categories: ['专业建设', '教学竞赛', '教研项目', '教研论文', '课程建设', '教材建设', '教学成果奖'] },
  projects: { title: '科研课题', noun: '项目', subtitle: '集中查阅纵向课题与横向项目', categories: ['纵向课题', '横向项目'] },
})
export const majors = reactive(['交通工程', '交通运输', '智慧交通'])
export const people = reactive<string[]>([])
export const memberTypes = reactive(['专业教师', '其他'])
export const memberRoles = ['系统管理员', '导师', '学生', '只读访客']
export const hasProjectTeam = (kind: Kind) => ['achievements', 'students', 'research', 'projects'].includes(kind)
export const hasParticipantOwners = (kind: Kind) => kind === 'development' || kind === 'teaching' || kind === 'daily'
export const ownerLabel = (kind: Kind) => kind === 'daily' ? '相关人员' : kind === 'teaching' ? '参加人员' : hasProjectTeam(kind) ? '项目主持' : '负责人'
export const participantsOf = (record: RecordItem): string[] => (record.kind === 'teaching' && record.owner && !record.participants?.length ? [record.owner] : record.participants) ?? (hasParticipantOwners(record.kind) && record.owner ? [record.owner] : [])
export const parseParticipants = (text: string): string[] => [...new Set(text.split(/[、,，;；\n]/).map(name => name.trim()).filter(Boolean))]
export const courseCategories = ['通识课', '学科基础课', '专业核心课', '专业选修课', '实践课']
export const isCourseMaterial = (category: string) => ['课程大纲', '教学日历', '实践教学资料', '实验教学资料', '教学课件'].includes(category)
export function blankRecord(kind: Kind): RecordItem {
  return { id: '', kind, title: '', category: definitions[kind].categories[0], owner: kind === 'news' || kind === 'students' ? '' : '赵欣', advisor: '', major: '交通工程', version: '2026版', year: '2026', level: '校级', source: '', start: '', end: '', summary: '', course: '', courseCode: '', courseType: '专业核心课', credits: '', hours: '', theory: '', practice: '', materialStatus: '现行', attachments: [] }
}
