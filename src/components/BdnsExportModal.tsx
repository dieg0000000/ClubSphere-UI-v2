import { useState, useMemo, useEffect } from 'react'
import { zipSync, strToU8 } from 'fflate'
import { supabase } from '../lib/supabase'
import { buildMatchAttendanceMap } from '../lib/trainingAttendance'
import { useAttendanceDefaultPresent } from '../hooks/useAttendanceDefaultPresent'
import { useTenant } from '../context/TenantContext'
import { StandardModal } from './StandardModal'
import Button from './ui/Button'
import { Download, AlertTriangle, CheckCircle, Info } from 'lucide-react'

/* ─── CSV HEADERS (BDNS official, do NOT change) ─── */

const HEADER_PERSONS =
  'N° PERSONNEL;NOM;PRENOM;DATE DE NAISSANCE;SEXE;N_AVS;PEID;NATIONALITE;LANGUE MATERNELLE;RUE;NUMERO;NPA;LOCALITE;PAYS'

const HEADER_ACTIVITIES =
  "TYPE D'ACTIVITE;DATE;HEURE;DUREE;LIEU;ACCENT"

const HEADER_ATTENDANCE =
  "NUMÉRO PERSONELL;FONCTION;DATE;TYPE D'ACHTIVITÉ;HEURE;DURÉE;LIEU"

/* ─── types ─── */

interface Team {
  id: string
  name: string
  type: string
  coach_id: string | null
  assistant_coach_id: string | null
}

interface MemberRow {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  gender: string | null
  avs_number: string | null
  js_number: string | null
  nationality: string | null
  address: string | null
  street_number: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  team_id: string | null
}

interface CoachRow {
  id: string
  first_name: string
  last_name: string
  js_number: string | null
}

interface TrainingSession {
  id: string
  team_id: string
  session_date: string
  slot_id: string | null
  validated_at: string | null
  effective_start_time: string | null
  effective_end_time: string | null
  effective_terrain_name: string | null
}

interface TrainingAttendanceRow {
  session_id: string
  member_id: string
  status: string | null
  present: boolean | null
  coach_override_at: string | null
}

interface MatchRow {
  id: string
  team_id: string
  match_date: string
  match_time: string | null
  opponent_name: string
  is_home: boolean
  status: string
}

interface MatchAttendanceRow {
  match_id: string
  member_id: string
  status: string
}

interface Anomaly {
  level: 'blocking' | 'warning'
  message: string
}

interface TeamReport {
  team: Team
  personLines: string[]
  activityLines: string[]
  attendanceLines: string[]
  anomalies: Anomaly[]
  trainingsCount: number
  matchesCount: number
  participantCount: number
  attendanceLinesCount: number
}

const VALID_DURATIONS = [60, 75, 90]

/* ─── helpers ─── */

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function timeMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function csvLine(fields: string[]): string {
  return fields.map(f => f.replace(/;/g, ',')).join(';')
}

function buildCsv(header: string, lines: string[]): Uint8Array {
  const bom = '﻿'
  const content = bom + header + '\r\n' + lines.join('\r\n')
  return strToU8(content)
}

function genderCode(g: string | null): string {
  if (!g) return ''
  const l = g.toLowerCase()
  if (['m', 'male', 'masculin'].includes(l)) return 'h'
  if (['f', 'female', 'féminin', 'feminin'].includes(l)) return 'f'
  return ''
}

function nationalityCode(nat: string | null): string {
  if (!nat) return 'autre'
  const l = nat.toLowerCase().trim()
  if (['ch', 'suisse', 'schweiz', 'switzerland', 'swiss'].includes(l)) return 'CH'
  if (['li', 'liechtenstein'].includes(l)) return 'LI'
  return 'autre'
}

function countryCode(c: string | null): string {
  if (!c) return 'CH'
  const u = c.toUpperCase().trim()
  if (u.length === 2) return u
  if (['suisse', 'schweiz', 'switzerland'].includes(c.toLowerCase().trim())) return 'CH'
  return u.slice(0, 2) || 'CH'
}

function cleanAvs(avs: string | null): string {
  if (!avs) return ''
  return avs.replace(/[\s.]/g, '')
}

function cleanJsNumber(js: string | null): string {
  if (!js) return ''
  return js.replace(/\D/g, '')
}

/* ─── season months ─── */

function getSeasonMonths(): { label: string; value: string }[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-based

  // Season runs Jul-Jun. Determine season start year.
  const seasonStartYear = currentMonth >= 6 ? currentYear : currentYear - 1
  const months: { label: string; value: string }[] = []
  for (let i = 0; i < 12; i++) {
    const m = (6 + i) % 12 // Jul=6, Aug=7, ..., Jun=5
    const y = m >= 6 ? seasonStartYear : seasonStartYear + 1
    const d = new Date(y, m, 1)
    if (d > now) break
    const label = d.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
    const value = `${y}-${String(m + 1).padStart(2, '0')}`
    months.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value })
  }
  return months
}

function getDefaultMonth(months: { value: string }[]): string {
  if (months.length === 0) return ''
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const target = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  const found = months.find(m => m.value === target)
  return found ? found.value : months[months.length - 1].value
}

/* ─── Props ─── */

interface Props {
  isOpen: boolean
  onClose: () => void
  teams: { id: string; name: string; type: string }[]
}

export function BdnsExportModal({ isOpen, onClose, teams: pageTeams }: Props) {
  const { clubId } = useTenant()
  const { value: defaultPresent } = useAttendanceDefaultPresent(clubId)
  const juniorTeams = useMemo(() => pageTeams.filter(t => t.type === 'junior'), [pageTeams])
  const [teamMode, setTeamMode] = useState<'all' | 'one'>('all')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const seasonMonths = useMemo(() => getSeasonMonths(), [])
  const [month, setMonth] = useState(() => getDefaultMonth(seasonMonths))
  const [periodMode, setPeriodMode] = useState<'cumulative' | 'single'>('cumulative')
  const [seasonStartDate, setSeasonStartDate] = useState<string | null>(null)
  const [filePersons, setFilePersons] = useState(true)
  const [fileActivities, setFileActivities] = useState(true)
  const [fileAttendance, setFileAttendance] = useState(true)
  const [includeMatches, setIncludeMatches] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    supabase
      .from('seasons')
      .select('start_date')
      .eq('active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.start_date) setSeasonStartDate(data.start_date)
      })
  }, [isOpen])

  const [checking, setChecking] = useState(false)
  const [reports, setReports] = useState<TeamReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setReports(null)
    setError(null)
  }

  const handleClose = () => {
    reset()
    setChecking(false)
    onClose()
  }

  /* ─── CONTROL ─── */

  async function handleControl() {
    setChecking(true)
    setError(null)
    setReports(null)
    try {
      const targetTeams = teamMode === 'one'
        ? juniorTeams.filter(t => t.id === selectedTeamId)
        : juniorTeams

      if (targetTeams.length === 0) {
        setError('Aucune équipe sélectionnée.')
        setChecking(false)
        return
      }

      // Fetch full team data with coach IDs
      const teamIds = targetTeams.map(t => t.id)
      const { data: fullTeams } = await supabase
        .from('teams')
        .select('id, name, type, coach_id, assistant_coach_id')
        .in('id', teamIds)
        .eq('active', true)
      if (!fullTeams || fullTeams.length === 0) {
        setError('Aucune équipe trouvée.')
        setChecking(false)
        return
      }

      // Parse month range — pure local strings, no UTC conversion
      const [yearStr, monthStr] = month.split('-')
      const yr = Number(yearStr)
      const mo = Number(monthStr)
      const monthStart = `${yearStr}-${monthStr}-01`
      const lastDay = new Date(yr, mo, 0).getDate()
      const monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const dateFrom = periodMode === 'cumulative' && seasonStartDate
        ? seasonStartDate
        : monthStart
      const dateTo = monthEnd
      const effectiveTo = dateTo > todayStr ? todayStr : dateTo



      // Fetch members for all target teams
      const { data: membersData } = await supabase
        .from('members')
        .select('id, first_name, last_name, birth_date, gender, avs_number, js_number, nationality, address, street_number, postal_code, city, country, team_id')
        .in('team_id', teamIds)
        .eq('licence_status', 'actif')
      const allMembers = (membersData || []) as MemberRow[]

      // Fetch coaches
      const coachIds = [...new Set(
        fullTeams.flatMap(t => [t.coach_id, t.assistant_coach_id].filter(Boolean))
      )] as string[]
      let allCoaches: CoachRow[] = []
      if (coachIds.length > 0) {
        const { data: coachData } = await supabase
          .from('coaches')
          .select('id, first_name, last_name, js_number')
          .in('id', coachIds)
        allCoaches = (coachData || []) as CoachRow[]
      }

      // Fetch training sessions in month from effective view
      const { data: sessionsData } = await supabase
        .from('v_training_sessions_effective')
        .select('id, team_id, session_date, slot_id, validated_at, effective_start_time, effective_end_time, effective_terrain_name')
        .in('team_id', teamIds)
        .eq('cancelled', false)
        .gte('session_date', dateFrom)
        .lte('session_date', effectiveTo)
        .order('session_date', { ascending: true })
      const allSessions: TrainingSession[] = ((sessionsData || []) as any[]).map(s => ({
        id: s.id, team_id: s.team_id, session_date: s.session_date,
        slot_id: s.slot_id, validated_at: s.validated_at,
        effective_start_time: s.effective_start_time || null,
        effective_end_time: s.effective_end_time || null,
        effective_terrain_name: s.effective_terrain_name || null,
      }))

      // Fetch attendance for these sessions
      const sessionIds = allSessions.map(s => s.id)
      let allAttendance: TrainingAttendanceRow[] = []
      if (sessionIds.length > 0) {
        const { data: attData } = await supabase
          .from('training_attendance')
          .select('session_id, member_id, status, present, coach_override_at')
          .in('session_id', sessionIds)
        allAttendance = (attData || []) as TrainingAttendanceRow[]
      }


      // Fetch matches if included
      let allMatches: MatchRow[] = []
      let matchAttendanceMap: Record<string, MatchAttendanceRow[]> = {}
      if (includeMatches) {
        const { data: matchData } = await supabase
          .from('matches')
          .select('id, team_id, match_date, match_time, opponent_name, is_home, status')
          .in('team_id', teamIds)
          .gte('match_date', dateFrom)
          .lte('match_date', effectiveTo)
          .order('match_date', { ascending: true })
        const cancelledStatuses = ['annulé', 'annule', 'reporté', 'reporte', 'cancelled']
        allMatches = ((matchData || []) as MatchRow[]).filter(
          m => !cancelledStatuses.includes((m.status || '').toLowerCase()) && m.match_date <= todayStr
        )

        const matchIds = allMatches.map(m => m.id)
        if (matchIds.length > 0) {
          const rpcMap = await buildMatchAttendanceMap(matchIds, defaultPresent)
          for (const [mid, recs] of Object.entries(rpcMap)) {
            matchAttendanceMap[mid] = recs.map(r => ({ match_id: mid, member_id: r.member_id, status: r.status === 'present_real' ? 'confirmed' : r.status }))
          }
        }
      }

      // Build reports per team
      const teamReports: TeamReport[] = []
      for (const team of fullTeams as Team[]) {
        const rawAnomalies: Anomaly[] = []
        const teamMembers = allMembers.filter(m => m.team_id === team.id)
        const teamCoaches: CoachRow[] = []
        if (team.coach_id) {
          const c = allCoaches.find(c => c.id === team.coach_id)
          if (c) teamCoaches.push(c)
        }
        if (team.assistant_coach_id) {
          const c = allCoaches.find(c => c.id === team.assistant_coach_id)
          if (c) teamCoaches.push(c)
        }

        // ── PERSONS CSV ──
        const personLines: string[] = []
        for (const m of teamMembers) {
          const sex = genderCode(m.gender)
          if (!sex) rawAnomalies.push({ level: 'warning', message: `Joueur ${m.first_name} ${m.last_name} : sexe manquant` })
          const avs = cleanAvs(m.avs_number)
          if (!avs) rawAnomalies.push({ level: 'warning', message: `Joueur ${m.first_name} ${m.last_name} : n° AVS manquant` })
          if (!m.address && !m.postal_code && !m.city) {
            rawAnomalies.push({ level: 'warning', message: `Joueur ${m.first_name} ${m.last_name} : adresse manquante` })
          }
          personLines.push(csvLine([
            cleanJsNumber(m.js_number),
            m.last_name,
            m.first_name,
            m.birth_date ? ddmmyyyy(m.birth_date) : '',
            sex,
            avs,
            '', // PEID
            nationalityCode(m.nationality),
            'FR', // langue maternelle
            m.address || '',
            m.street_number || '',
            m.postal_code || '',
            m.city || '',
            countryCode(m.country),
          ]))
        }

        // ── ACTIVITIES + ATTENDANCE ──
        const activityLines: string[] = []
        const attendanceLines: string[] = []
        let trainingsCount = 0
        let matchesCount = 0

        // Training sessions
        const teamSessions = allSessions.filter(s => s.team_id === team.id)
        for (const session of teamSessions) {
          // Resolve time + location from effective view
          let startTime = ''
          let durationMin = 0
          let location = ''

          if (session.effective_start_time && session.effective_end_time) {
            startTime = session.effective_start_time.slice(0, 5)
            durationMin = timeMinutes(session.effective_end_time) - timeMinutes(session.effective_start_time)
            location = session.effective_terrain_name || ''
          }

          if (!startTime) {
            rawAnomalies.push({ level: 'blocking', message: `Entraînement du ${ddmmyyyy(session.session_date)} : pas de créneau ni d'horaire — exclu` })
            continue
          }

          // Duration rounding
          let bdnsDuration: number
          if (VALID_DURATIONS.includes(durationMin)) {
            bdnsDuration = durationMin
          } else {
            const candidates = VALID_DURATIONS.filter(d => d <= durationMin)
            if (candidates.length === 0) {
              rawAnomalies.push({ level: 'blocking', message: `Entraînement du ${ddmmyyyy(session.session_date)} : durée ${durationMin} min < 60 — exclu` })
              continue
            }
            bdnsDuration = Math.max(...candidates)
            rawAnomalies.push({ level: 'warning', message: `Entraînement du ${ddmmyyyy(session.session_date)} : durée ${durationMin} → arrondie à ${bdnsDuration} min` })
          }

          if (!session.validated_at) {
            rawAnomalies.push({ level: 'warning', message: `Entraînement du ${ddmmyyyy(session.session_date)} : non validé par l'entraîneur` })
          }

          const dateStr = ddmmyyyy(session.session_date)
          activityLines.push(csvLine([
            'Entraînement',
            dateStr,
            startTime,
            String(bdnsDuration),
            location,
            '', // ACCENT
          ]))
          trainingsCount++

          // Attendance for this session
          const sessionAttendance = allAttendance.filter(a => a.session_id === session.id)
          const absentMemberIds = new Set(
            sessionAttendance
              .filter(a => {
                if (a.status?.startsWith('absent_')) return true
                if (a.present === false && a.coach_override_at) return true
                return false
              })
              .map(a => a.member_id)
          )

          // Present members
          const presentMembers = teamMembers.filter(m => !absentMemberIds.has(m.id))
          for (const m of presentMembers) {
            const js = cleanJsNumber(m.js_number)
            if (!js) {
              rawAnomalies.push({ level: 'blocking', message: `${m.first_name} ${m.last_name} sans n° J+S` })
              continue
            }
            attendanceLines.push(csvLine([
              js,
              'Participant/e',
              dateStr,
              'Entraînement',
              startTime,
              String(bdnsDuration),
              location,
            ]))
          }

          // Coaches present
          for (const c of teamCoaches) {
            const js = cleanJsNumber(c.js_number)
            if (!js) {
              rawAnomalies.push({ level: 'blocking', message: `Moniteur ${c.first_name} ${c.last_name} sans n° J+S` })
              continue
            }
            attendanceLines.push(csvLine([
              js,
              'moniteur/trice',
              dateStr,
              'Entraînement',
              startTime,
              String(bdnsDuration),
              location,
            ]))
          }
        }

        // Match activities
        if (includeMatches) {
          const teamMatches = allMatches.filter(m => m.team_id === team.id)
          for (const match of teamMatches) {
            const dateStr = ddmmyyyy(match.match_date)
            activityLines.push(csvLine([
              'Compétition',
              dateStr,
              '', // HEURE vide
              '', // DUREE vide
              '', // LIEU vide
              '', // ACCENT
            ]))
            matchesCount++

            // Match attendance: present players based on club setting
            const ma = matchAttendanceMap[match.id] || []
            const confirmedIds = new Set(ma.filter(a => a.status === 'confirmed').map(a => a.member_id))
            for (const m of teamMembers.filter(m => confirmedIds.has(m.id))) {
              const js = cleanJsNumber(m.js_number)
              if (!js) {
                rawAnomalies.push({ level: 'blocking', message: `${m.first_name} ${m.last_name} sans n° J+S` })
                continue
              }
              attendanceLines.push(csvLine([
                js,
                'Participant/e',
                dateStr,
                'Compétition',
                '',
                '',
                '',
              ]))
            }

            // Coaches at matches
            for (const c of teamCoaches) {
              const js = cleanJsNumber(c.js_number)
              if (!js) continue // already flagged for trainings
              attendanceLines.push(csvLine([
                js,
                'moniteur/trice',
                dateStr,
                'Compétition',
                '',
                '',
                '',
              ]))
            }
          }
        }

        // Deduplicate anomalies: group identical messages and show count
        const countMap = new Map<string, { level: 'blocking' | 'warning'; count: number }>()
        for (const a of rawAnomalies) {
          const key = `${a.level}::${a.message}`
          const existing = countMap.get(key)
          if (existing) { existing.count++ } else { countMap.set(key, { level: a.level, count: 1 }) }
        }
        const anomalies: Anomaly[] = []
        for (const [key, { level, count }] of countMap) {
          const msg = key.slice(level.length + 2)
          anomalies.push({ level, message: count > 1 ? `${msg} (${count} lignes omises)` : (level === 'blocking' ? `${msg} (ligne omise)` : msg) })
        }

        teamReports.push({
          team,
          personLines,
          activityLines,
          attendanceLines,
          anomalies,
          trainingsCount,
          matchesCount,
          participantCount: teamMembers.length,
          attendanceLinesCount: attendanceLines.length,
        })
      }

      setReports(teamReports)
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue')
    } finally {
      setChecking(false)
    }
  }

  /* ─── DOWNLOAD ─── */

  function handleDownload() {
    if (!reports) return

    const activeReports = reports.filter(r => r.activityLines.length > 0)
    if (activeReports.length === 0) return

    // Recompute period bounds for file names
    const [yearStr, monthStr] = month.split('-')
    const yr = Number(yearStr)
    const mo = Number(monthStr)
    const monthStart = `${yearStr}-${monthStr}-01`
    const lastDay = new Date(yr, mo, 0).getDate()
    const monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    const dateFrom = periodMode === 'cumulative' && seasonStartDate
      ? seasonStartDate
      : monthStart
    const dateTo = monthEnd
    const periodFromYYYYMM = dateFrom.slice(0, 7)
    const periodToYYYYMM = dateTo.slice(0, 7)
    const isCumulative = periodMode === 'cumulative'
    const fileSuffix = isCumulative ? `${periodFromYYYYMM}_${periodToYYYYMM}` : month
    const periodLabel = `du ${ddmmyyyy(dateFrom)} au ${ddmmyyyy(dateTo)}`

    const files: Record<string, Uint8Array> = {}

    for (const r of activeReports) {
      const slug = sanitizeFilename(r.team.name)
      const prefix = teamMode === 'all' ? `${slug}/` : ''

      if (filePersons && r.personLines.length > 0) {
        if (r.personLines.length <= 200) {
          files[`${prefix}JS_1_personnes_${slug}_${fileSuffix}.csv`] = buildCsv(HEADER_PERSONS, r.personLines)
        } else {
          for (let i = 0; i < r.personLines.length; i += 200) {
            const chunk = r.personLines.slice(i, i + 200)
            const part = Math.floor(i / 200) + 1
            files[`${prefix}JS_1_personnes_${slug}_${fileSuffix}_partie${part}.csv`] = buildCsv(HEADER_PERSONS, chunk)
          }
        }
      }

      if (fileActivities && r.activityLines.length > 0) {
        files[`${prefix}JS_2_activites_${slug}_${fileSuffix}.csv`] = buildCsv(HEADER_ACTIVITIES, r.activityLines)
      }

      if (fileAttendance && r.attendanceLines.length > 0) {
        files[`${prefix}JS_3_presences_${slug}_${fileSuffix}.csv`] = buildCsv(HEADER_ATTENDANCE, r.attendanceLines)
      }

      // controle.txt
      const ctrlLines: string[] = []
      if (!isCumulative) {
        ctrlLines.push(`AVERTISSEMENT : export d'un mois seul — l'import remplacera tout le contenu du cours dans la BDNS.`)
        ctrlLines.push('')
      }
      ctrlLines.push(`Équipe : ${r.team.name}`)
      ctrlLines.push(`Période : ${periodLabel}`)
      ctrlLines.push(`Entraînements : ${r.trainingsCount}`)
      ctrlLines.push(`Compétitions (matchs) : ${r.matchesCount}`)
      ctrlLines.push(`Participants : ${r.participantCount}`)
      ctrlLines.push(`Lignes de présence : ${r.attendanceLinesCount}`)
      ctrlLines.push('')
      const blocking = r.anomalies.filter(a => a.level === 'blocking')
      const warnings = r.anomalies.filter(a => a.level === 'warning')
      if (blocking.length > 0) {
        ctrlLines.push('BLOQUANT (lignes omises) :')
        for (const a of blocking) ctrlLines.push(`  - ${a.message}`)
        ctrlLines.push('')
      }
      if (warnings.length > 0) {
        ctrlLines.push('AVERTISSEMENTS :')
        for (const a of warnings) ctrlLines.push(`  - ${a.message}`)
      }
      if (blocking.length === 0 && warnings.length === 0) {
        ctrlLines.push('Aucune anomalie détectée.')
      }
      files[`${prefix}controle.txt`] = strToU8(ctrlLines.join('\r\n'))
    }

    // LISEZ-MOI.txt
    const teamNames = activeReports.map(r => r.team.name)
    const readmeLines = [
      `ClubSphere — Export J+S (BDNS)`,
      `Période : ${periodLabel}`,
      `Équipes : ${teamNames.join(', ')}`,
      '',
      `Ordre d'import dans la BDNS, pour chaque équipe (= un cours J+S) :`,
      `1. JS_1_personnes_… (maximum 200 personnes par fichier)`,
      `2. JS_2_activites_…`,
      `3. JS_3_presences_…`,
      '',
      `Important : l'import d'activités remplace TOUTES les activités et présences déjà saisies dans le cours. Importez toujours la période complète depuis le début de la saison.`,
      `Les personnes sans n° J+S sont listées dans controle.txt : elles doivent d'abord être créées dans la BDNS, puis leur n° personnel reporté dans ClubSphere.`,
    ]
    files['LISEZ-MOI.txt'] = strToU8(readmeLines.join('\r\n'))

    const zipped = zipSync(files)
    const zipName = teamMode === 'all'
      ? `ClubSphere_JS_${fileSuffix}.zip`
      : `ClubSphere_JS_${sanitizeFilename(activeReports[0].team.name)}_${fileSuffix}.zip`

    const blob = new Blob([zipped], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = zipName
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ─── RENDER ─── */

  const hasAnyActivity = reports?.some(r => r.activityLines.length > 0) ?? false

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border-color)', background: 'var(--bg-hover)',
    color: 'var(--text-primary)', fontSize: 14,
  }

  return (
    <StandardModal isOpen={isOpen} onClose={handleClose} title="Export J+S (BDNS)" subtitle="Ordre d'import dans la BDNS : 1) Personnes → 2) Activités → 3) Contrôle des présences. Chaque import d'activités remplace le contenu du cours." width="560px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Seules les équipes juniors sont exportées : J+S ne subventionne que la formation des jeunes.
        </div>

        {/* Team selection */}
        <div>
          <label style={labelStyle}>Équipes</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="radio" checked={teamMode === 'all'} onChange={() => { setTeamMode('all'); reset() }} />
              Toutes les équipes juniors (un jeu de fichiers par équipe)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="radio" checked={teamMode === 'one'} onChange={() => { setTeamMode('one'); reset() }} />
              Une équipe
            </label>
            {teamMode === 'one' && (
              <select
                style={{ ...inputStyle, marginTop: 4 }}
                value={selectedTeamId}
                onChange={e => { setSelectedTeamId(e.target.value); reset() }}
              >
                <option value="">-- Choisir --</option>
                {juniorTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Month */}
        <div>
          <label style={labelStyle}>Jusqu'à fin</label>
          <select style={inputStyle} value={month} onChange={e => { setMonth(e.target.value); reset() }}>
            {seasonMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Period mode */}
        <div>
          <label style={labelStyle}>Période</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="radio" checked={periodMode === 'cumulative'} onChange={() => { setPeriodMode('cumulative'); reset() }} style={{ marginTop: 3 }} />
              <span>Depuis le début de la saison jusqu'à fin {(seasonMonths.find(m => m.value === month)?.label || month).toLowerCase()} (recommandé)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="radio" checked={periodMode === 'single'} onChange={() => { setPeriodMode('single'); reset() }} style={{ marginTop: 3 }} />
              <span>Le mois {(() => { const ml = (seasonMonths.find(m => m.value === month)?.label || month).toLowerCase(); return /^[aeiouéè]/.test(ml) ? `d'${ml}` : `de ${ml}`; })()} uniquement</span>
            </label>
          </div>
          {periodMode === 'single' && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--danger-soft, #fef2f2)', border: '1px solid var(--danger, #ef4444)', display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--danger, #dc2626)' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Attention : dans la BDNS, chaque import d'activités remplace TOUTES les activités et présences déjà saisies dans le cours. Si vous importez ce mois seul, les mois précédents seront effacés du cours J+S. N'utilisez ce mode que pour un tout premier import, ou si le cours ne contient encore aucune activité. Dans le doute, choisissez « Depuis le début de la saison ».
              </span>
            </div>
          )}
        </div>

        {/* Files to produce */}
        <div>
          <label style={labelStyle}>Fichiers à produire</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filePersons} onChange={e => { setFilePersons(e.target.checked); reset() }} />
              Personnes (participants)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={fileActivities} onChange={e => { setFileActivities(e.target.checked); reset() }} />
              Activités
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={fileAttendance} onChange={e => { setFileAttendance(e.target.checked); reset() }} />
              Contrôle des présences
            </label>
          </div>
        </div>

        {/* Include matches */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={includeMatches} onChange={e => { setIncludeMatches(e.target.checked); reset() }} />
          Inclure les matchs comme compétitions
        </label>

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Control results */}
        {reports && (
          <div style={{
            maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
            padding: '14px', borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
          }}>
            {(() => {
              const [ys, ms] = month.split('-');
              const y = Number(ys); const m = Number(ms);
              const mStart = periodMode === 'cumulative' && seasonStartDate ? seasonStartDate : `${ys}-${ms}-01`;
              const ld = new Date(y, m, 0).getDate();
              const mEnd = `${ys}-${ms}-${String(ld).padStart(2, '0')}`;
              return (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Période : du {ddmmyyyy(mStart)} au {ddmmyyyy(mEnd)}
                </div>
              );
            })()}
            {reports.map(r => {
              const hasActivity = r.activityLines.length > 0
              const blocking = r.anomalies.filter(a => a.level === 'blocking')
              const warnings = r.anomalies.filter(a => a.level === 'warning')
              return (
                <div key={r.team.id}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 6 }}>
                    {r.team.name}
                  </div>
                  {!hasActivity ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Aucune activité dans cette période
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        <span>{r.trainingsCount} entraînement{r.trainingsCount > 1 ? 's' : ''}</span>
                        <span>{r.matchesCount} compétition{r.matchesCount > 1 ? 's' : ''}</span>
                        <span>{r.participantCount} participant{r.participantCount > 1 ? 's' : ''}</span>
                        <span>{r.attendanceLinesCount} ligne{r.attendanceLinesCount > 1 ? 's' : ''} de présence</span>
                      </div>
                      {blocking.length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          {blocking.map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: 'var(--danger)', marginBottom: 2 }}>
                              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                              <span>{a.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <div>
                          {warnings.map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: 'var(--warning)', marginBottom: 2 }}>
                              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                              <span>{a.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {blocking.length === 0 && warnings.length === 0 && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--success)' }}>
                          <CheckCircle size={13} /> Aucune anomalie
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose}>Annuler</Button>
          {!reports ? (
            <Button
              onClick={handleControl}
              disabled={checking || (teamMode === 'one' && !selectedTeamId) || !month || (!filePersons && !fileActivities && !fileAttendance)}
            >
              {checking ? 'Contrôle en cours…' : 'Contrôler'}
            </Button>
          ) : (
            <Button
              onClick={handleDownload}
              disabled={!hasAnyActivity}
              leftIcon={<Download size={16} />}
            >
              Télécharger
            </Button>
          )}
        </div>
      </div>
    </StandardModal>
  )
}
