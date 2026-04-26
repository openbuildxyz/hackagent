export interface ProjectCSVRow {
  name: string
  github_url: string
  demo_url?: string
  description: string
  team_name?: string
  tags?: string
  track_ids?: string[]
  extra_fields?: Record<string, string>
}

export interface ParseResult {
  valid: ProjectCSVRow[]
  errors: Array<{ row: number; message: string }>
}

/**
 * RFC 4180 compliant CSV parser.
 * Returns array of rows, each row is array of field strings.
 * Handles: quoted fields, embedded newlines, escaped quotes (""), BOM, CRLF/LF/CR.
 */
function parseCSVRows(text: string): string[][] {
  // Normalize: strip BOM, normalize line endings within the parser
  const src = text.replace(/^\uFEFF/, '')

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          // Escaped quote
          field += '"'
          i += 2
        } else {
          // End of quoted field
          inQuotes = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        row.push(field)
        field = ''
        i++
      } else if (ch === '\r') {
        // CR or CRLF — end of record
        row.push(field)
        field = ''
        rows.push(row)
        row = []
        i++
        if (src[i] === '\n') i++ // consume LF
      } else if (ch === '\n') {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
        i++
      } else {
        field += ch
        i++
      }
    }
  }

  // Last field / row
  if (field || row.length > 0) {
    row.push(field)
    if (row.some(f => f !== '')) rows.push(row)
  }

  return rows
}

export function parseCSV(text: string): ParseResult {
  const allRows = parseCSVRows(text)
  const valid: ProjectCSVRow[] = []
  const errors: Array<{ row: number; message: string }> = []

  if (allRows.length === 0) {
    return { valid, errors: [{ row: 0, message: '文件为空' }] }
  }

  const rawHeader = allRows[0].map(h => h.trim())
  const header = rawHeader.map(h => h.toLowerCase())

  const ALIASES: Record<string, string[]> = {
    name:        ['name', '项目名称', '项目名', '名称', 'project_name', 'project name', 'project_title', 'title', 'submission name', 'submission_name', 'app name', 'app_name'],
    github_url:  ['github_url', 'github', 'github链接', 'github地址', 'github link', 'github url', 'repo', 'repository', '仓库地址', '仓库链接', 'source code', 'source_code', 'code url', 'code_url'],
    description: ['description', '描述', '项目描述', '项目介绍', 'intro', '简介', 'summary', 'project description', 'project_description', 'about', 'detail', 'details', 'overview', 'brief'],
    demo_url:    ['demo_url', 'demo', 'demo链接', 'demo地址', '演示链接', '演示地址', 'website', '网站', 'demo link', 'demo url', 'live', 'live url', 'live_url', 'app url', 'app_url', 'product url'],
    team_name:   ['team_name', 'team', '团队', '团队名称', '队伍', '队伍名称', 'team name', 'group', 'group name', '提交人姓名', '提交人'],
    tags:        ['tags', '标签', '赛道', 'track', '赛道标签', 'category', 'categories', 'tag', 'track name'],
  }

  function findCol(field: string): number {
    for (const alias of ALIASES[field]) {
      const idx = header.indexOf(alias)
      if (idx >= 0) return idx
    }
    for (const alias of ALIASES[field]) {
      const idx = header.findIndex(h => h.includes(alias) || alias.includes(h))
      if (idx >= 0) return idx
    }
    return -1
  }

  const nameIdx    = findCol('name')
  const githubIdx  = findCol('github_url')
  const demoIdx    = findCol('demo_url')
  const descIdx    = findCol('description')
  const teamIdx    = findCol('team_name')
  const tagsIdx    = findCol('tags')

  const missing: string[] = []
  if (nameIdx < 0)   missing.push('name（项目名称）')
  if (githubIdx < 0) missing.push('github_url（GitHub链接）')
  if (descIdx < 0)   missing.push('description（项目描述）')
  if (missing.length > 0) {
    errors.push({ row: 0, message: `缺少必填列: ${missing.join('、')}` })
    return { valid, errors }
  }

  const standardIdxSet1 = new Set([nameIdx, githubIdx, demoIdx, descIdx, teamIdx, tagsIdx].filter(i => i >= 0))

  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i]
    const rowNum = i + 1

    const name = cols[nameIdx]?.trim()
    const github_url = cols[githubIdx]?.trim()
    const description = cols[descIdx]?.trim()

    if (!name) {
      errors.push({ row: rowNum, message: '项目名称不能为空' })
      continue
    }
    if (!github_url) {
      errors.push({ row: rowNum, message: 'GitHub URL不能为空' })
      continue
    }
    if (!description) {
      errors.push({ row: rowNum, message: '项目描述不能为空' })
      continue
    }

        valid.push({
      name,
      github_url,
      demo_url: demoIdx >= 0 ? cols[demoIdx]?.trim() : undefined,
      description,
      team_name: teamIdx >= 0 ? cols[teamIdx]?.trim() : undefined,
      tags: tagsIdx >= 0 ? cols[tagsIdx]?.trim() : undefined,
    })
  }

  return { valid, errors }
}

export function parseCSVWithMapping(
  text: string,
  mapping: { name?: string | null; github_url?: string | null; description?: string | null; demo_url?: string | null; team_name?: string | null; tags?: string | null; extra?: Record<string, string> }
): ParseResult {
  const allRows = parseCSVRows(text)
  const valid: ProjectCSVRow[] = []
  const errors: Array<{ row: number; message: string }> = []

  if (allRows.length === 0) {
    return { valid, errors: [{ row: 0, message: '文件为空' }] }
  }

  const rawHeader = allRows[0].map(h => h.trim())

  function colIdx(colName: string | null): number {
    if (!colName) return -1
    const normalized = colName.trim().toLowerCase()
    return rawHeader.findIndex(h => h.toLowerCase() === normalized)
  }

  const nameIdx    = colIdx(mapping.name ?? null)
  const githubIdx  = colIdx(mapping.github_url ?? null)
  const descIdx    = colIdx(mapping.description ?? null)
  const demoIdx    = colIdx(mapping.demo_url ?? null)
  const teamIdx    = colIdx(mapping.team_name ?? null)
  const tagsIdx    = colIdx(mapping.tags ?? null)

  // Extra (custom) columns: { labelName -> csvColumnName }
  const extraColMap: Array<{ label: string; idx: number }> = []
  if (mapping.extra) {
    for (const [label, csvCol] of Object.entries(mapping.extra)) {
      const idx = colIdx(csvCol)
      if (idx >= 0) extraColMap.push({ label, idx })
    }
  }

  const standardIdxSet2 = new Set([nameIdx, githubIdx, demoIdx, descIdx, teamIdx, tagsIdx, ...extraColMap.map(e => e.idx)].filter(i => i >= 0))

  const missing: string[] = []
  if (nameIdx < 0)   missing.push('name（项目名称）')
  if (githubIdx < 0) missing.push('github_url（GitHub链接）')
  if (descIdx < 0)   missing.push('description（项目描述）')
  if (missing.length > 0) {
    errors.push({ row: 0, message: `缺少必填列: ${missing.join('、')}` })
    return { valid, errors }
  }

  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i]
    const rowNum = i + 1

    const name = cols[nameIdx]?.trim()
    const github_url = cols[githubIdx]?.trim()
    const description = cols[descIdx]?.trim()

    if (!name) {
      errors.push({ row: rowNum, message: '项目名称不能为空' })
      continue
    }
    if (!github_url) {
      errors.push({ row: rowNum, message: 'GitHub URL不能为空' })
      continue
    }
    if (!description) {
      errors.push({ row: rowNum, message: '项目描述不能为空' })
      continue
    }

    // Collect explicitly mapped extra columns only
    const extra_fields: Record<string, string> = {}
    for (const { label, idx } of extraColMap) {
      const val = cols[idx]?.trim()
      if (val) extra_fields[label] = val
    }

    valid.push({
      name,
      github_url,
      demo_url: demoIdx >= 0 ? cols[demoIdx]?.trim() : undefined,
      description,
      team_name: teamIdx >= 0 ? cols[teamIdx]?.trim() : undefined,
      tags: tagsIdx >= 0 ? cols[tagsIdx]?.trim() : undefined,
      extra_fields: Object.keys(extra_fields).length > 0 ? extra_fields : undefined,
    })
  }

  return { valid, errors }
}

export function generateCSVTemplate(): string {
  const header = 'name,github_url,demo_url,description,team_name,tags'
  const example =
    '示例项目,https://github.com/example/project,https://demo.example.com,这是一个创新性的Web3项目描述,示例团队,DeFi;NFT'
  return `${header}\n${example}`
}

export function exportScoresToCSV(
  projects: Array<{
    name: string
    team_name?: string | null
    overall_score: number
    rank: number
  }>
): string {
  const header = '排名,项目名称,团队名称,综合评分'
  const rows = projects.map(
    (p) => `${p.rank},"${p.name}","${p.team_name || ''}",${p.overall_score.toFixed(2)}`
  )
  return [header, ...rows].join('\n')
}
