import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Calendar,
  Clock,
  Users,
  Check,
  X,
  Plus,
  Trash2,
  Save,
  Database,
  ShieldCheck,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Reservation,
  ReservationStatus,
  StoreSettings,
  TableType,
  VALIDATION_RULES,
} from '../types';

interface AdminDashboardProps {
  isAdmin: boolean;
  userEmail: string | null;
  reservations: Reservation[];
  storeSettings: StoreSettings;
  onUpdateReservationStatus: (
    reservation: Reservation,
    newStatus: ReservationStatus,
    adminMemo?: string
  ) => Promise<void>;
  onDeleteReservation: (reservationId: string, isSimulation?: boolean) => Promise<void>;
  onSeedSampleReservations: () => Promise<void>;
  onSaveStoreSettings: (nextSettings: StoreSettings) => Promise<void>;
  onRequestLogin: () => void;
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: '대기',
  confirmed: '확정',
  completed: '방문 완료',
  cancelled: '취소',
  noshow: '노쇼',
};

const TABLE_LABELS: Record<TableType, string> = {
  hall: '메인 홀',
  window: '창가석',
  private_room: '프라이빗 룸',
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isAdmin,
  userEmail,
  reservations,
  storeSettings,
  onUpdateReservationStatus,
  onDeleteReservation,
  onSeedSampleReservations,
  onSaveStoreSettings,
  onRequestLogin,
}) => {
  const [adminTab, setAdminTab] = useState<'reservations' | 'settings'>('reservations');
  const [statusFilter, setStatusFilter] = useState<'all' | ReservationStatus>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Store settings form state
  const [draftSettings, setDraftSettings] = useState<StoreSettings>(storeSettings);
  const [newTimeSlot, setNewTimeSlot] = useState<string>('20:00');
  const [newClosedDate, setNewClosedDate] = useState<string>('2026-11-23');
  const [newBlockDate, setNewBlockDate] = useState<string>('2026-11-05');
  const [newBlockTime, setNewBlockTime] = useState<string>('19:00');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Keep draft settings synced if parent updates
  React.useEffect(() => {
    setDraftSettings(storeSettings);
  }, [storeSettings]);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    window.setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (dateFilter !== 'all' && item.date !== dateFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matchName = item.customerName.toLowerCase().includes(q);
        const matchPhone = item.customerPhone.toLowerCase().includes(q);
        const matchMenu = item.preselectedMenu.toLowerCase().includes(q);
        const matchNotes = item.notes.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchMenu && !matchNotes) return false;
      }
      return true;
    });
  }, [reservations, statusFilter, dateFilter, searchQuery]);

  // Summary metrics matching Proposal Section 7
  const metrics = useMemo(() => {
    const scopeList =
      dateFilter === 'all'
        ? reservations
        : reservations.filter((r) => r.date === dateFilter);

    const totalCount = scopeList.length;
    const upcomingCount = scopeList.filter(
      (r) => r.status === 'confirmed' || r.status === 'pending'
    ).length;
    const pendingCount = scopeList.filter((r) => r.status === 'pending').length;
    const totalGuests = scopeList
      .filter((r) => r.status !== 'cancelled' && r.status !== 'noshow')
      .reduce((acc, r) => acc + r.partySize, 0);

    return {
      totalCount,
      upcomingCount,
      pendingCount,
      totalGuests,
    };
  }, [reservations, dateFilter]);

  const distinctDates = useMemo(() => {
    const set = new Set<string>(['2026-11-05']);
    reservations.forEach((r) => set.add(r.date));
    return Array.from(set).sort();
  }, [reservations]);

  const handleStatusChange = async (
    reservation: Reservation,
    nextStatus: ReservationStatus
  ) => {
    setBusyId(reservation.id);
    try {
      await onUpdateReservationStatus(reservation, nextStatus);
      showToast(
        `${reservation.customerName}님 예약 상태가 [${STATUS_LABELS[nextStatus]}](으)로 변경되었습니다.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveMemo = async (reservation: Reservation) => {
    setBusyId(reservation.id);
    try {
      const sanitizedMemo = memoDraft.slice(0, VALIDATION_RULES.ADMIN_MEMO_MAX_LENGTH);
      await onUpdateReservationStatus(reservation, reservation.status, sanitizedMemo);
      setEditingMemoId(null);
      showToast(`${reservation.customerName}님 관리자 메모가 저장되었습니다.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      '예약번호',
      '예약자성함',
      '연락처',
      '이메일',
      '방문날짜',
      '방문시간',
      '인원(명)',
      '좌석유형',
      '사전선택메뉴',
      '고객요청사항',
      '관리자메모',
      '예약상태',
    ];
    const rows = filteredReservations.map((r) => [
      r.id,
      r.customerName,
      r.customerPhone,
      r.customerEmail,
      r.date,
      r.time,
      String(r.partySize),
      TABLE_LABELS[r.tableType] || r.tableType,
      r.preselectedMenu || '-',
      (r.notes || '').replace(/"/g, '""'),
      (r.adminMemo || '').replace(/"/g, '""'),
      STATUS_LABELS[r.status] || r.status,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.map((v) => `"${v}"`).join(','))].join(
        '\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `하오찬_예약목록_${dateFilter === 'all' ? '전체' : dateFilter}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('예약 목록 엑셀(CSV) 파일 다운로드가 완료되었습니다.');
  };

  const handleAddSlot = () => {
    const trimmed = newTimeSlot.trim();
    if (!VALIDATION_RULES.TIME_PATTERN.test(trimmed)) {
      showToast('시간 형식은 HH:MM (예: 20:00)으로 입력해 주세요.');
      return;
    }
    if (draftSettings.availableSlots.includes(trimmed)) {
      showToast('이미 등록된 예약 시간입니다.');
      return;
    }
    if (draftSettings.availableSlots.length >= 20) {
      showToast('예약 시간 슬롯은 최대 20개까지 설정할 수 있습니다.');
      return;
    }
    const nextSlots = [...draftSettings.availableSlots, trimmed].sort();
    setDraftSettings({ ...draftSettings, availableSlots: nextSlots });
  };

  const handleRemoveSlot = (slot: string) => {
    if (draftSettings.availableSlots.length <= 1) {
      showToast('최소 1개 이상의 예약 시간 슬롯이 필요합니다.');
      return;
    }
    setDraftSettings({
      ...draftSettings,
      availableSlots: draftSettings.availableSlots.filter((s) => s !== slot),
    });
  };

  const handleAddClosedDate = () => {
    if (!VALIDATION_RULES.DATE_PATTERN.test(newClosedDate)) {
      showToast('날짜 형식은 YYYY-MM-DD로 선택해 주세요.');
      return;
    }
    if (draftSettings.closedDates.includes(newClosedDate)) {
      showToast('이미 휴무일로 등록된 날짜입니다.');
      return;
    }
    const nextDates = [...draftSettings.closedDates, newClosedDate].sort();
    setDraftSettings({ ...draftSettings, closedDates: nextDates });
  };

  const handleRemoveClosedDate = (dateStr: string) => {
    setDraftSettings({
      ...draftSettings,
      closedDates: draftSettings.closedDates.filter((d) => d !== dateStr),
    });
  };

  const handleAddBlockedSlotKey = () => {
    const key = `${newBlockDate}_${newBlockTime}`;
    if (draftSettings.blockedSlotKeys.includes(key)) {
      showToast('이미 차단된 날짜·시간입니다.');
      return;
    }
    setDraftSettings({
      ...draftSettings,
      blockedSlotKeys: [...draftSettings.blockedSlotKeys, key].sort(),
    });
  };

  const handleRemoveBlockedSlotKey = (key: string) => {
    setDraftSettings({
      ...draftSettings,
      blockedSlotKeys: draftSettings.blockedSlotKeys.filter((k) => k !== key),
    });
  };

  const handleSaveSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await onSaveStoreSettings(draftSettings);
      showToast('매장 예약 가능 시간 · 좌석 · 휴무일 설정이 반영되었습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      {/* Top Header & Mode Notice */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#F7F2E9]/10">
        <div className="space-y-2">
          <div className="text-xs text-[#B69358] tracking-wider">
            하오찬 매장 운영 시스템 · 예약 및 좌석 통합 관리
          </div>
          <h1 className="font-serif-kr text-3xl sm:text-4xl font-bold text-[#F7F2E9]">
            하오찬 예약 관리
          </h1>
          <p className="text-sm text-[#F7F2E9]/70 max-w-2xl">
            날짜별·시간별 예약 현황을 실시간으로 확인하고, 예약 확정·취소 상태 변경과 영업시간·휴무일·잔여 좌석 정원을 관리합니다.
          </p>
        </div>

        {/* Mode Switcher & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#272320] border border-[#F7F2E9]/10 rounded-lg">
            <button
              type="button"
              onClick={() => setAdminTab('reservations')}
              className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                adminTab === 'reservations'
                  ? 'bg-[#A52A32] text-[#F7F2E9]'
                  : 'text-[#F7F2E9]/70 hover:text-[#F7F2E9]'
              }`}
            >
              예약 목록 관리
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('settings')}
              className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                adminTab === 'settings'
                  ? 'bg-[#A52A32] text-[#F7F2E9]'
                  : 'text-[#F7F2E9]/70 hover:text-[#F7F2E9]'
              }`}
            >
              예약 가능 시간 · 휴무일 · 좌석 설정
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#272320] hover:bg-[#322D29] border border-[#B69358]/40 text-[#F7F2E9] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#B69358]" />
            <span>예약 목록 엑셀 다운로드</span>
          </button>
        </div>
      </div>

      {/* Admin Permission & Sandbox Banner */}
      <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#B69358] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs sm:text-sm">
            {isAdmin ? (
              <p className="text-[#F7F2E9]">
                <span className="font-semibold text-[#B69358]">관리자 인증 완료 ({userEmail})</span>
                {' · '}모든 예약 상태 변경 및 좌석·휴무일 설정이 실시간 Firestore 데이터베이스에 즉시 반영됩니다.
              </p>
            ) : (
              <p className="text-[#F7F2E9]/85">
                <span className="font-semibold text-[#B69358]">관리자 대시보드 시안 체험 모드</span>
                {' · '}현재 화면에서 상태 필터, 예약 확정/취소, 좌석 설정, 엑셀 다운로드를 즉시 테스트할 수 있으며, 실제 DB 반영은 관리자 계정 로그인 시 활성화됩니다.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {!isAdmin && (
            <button
              type="button"
              onClick={onRequestLogin}
              className="px-3.5 py-2 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              관리자 계정 로그인
            </button>
          )}
          <button
            type="button"
            disabled={seedBusy}
            onClick={async () => {
              setSeedBusy(true);
              try {
                await onSeedSampleReservations();
                showToast('기획안 예시 예약 데이터(김민수·이지영·박서준·정유진)가 불러와졌습니다.');
              } finally {
                setSeedBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1E1B19] hover:bg-[#302B27] border border-[#F7F2E9]/15 text-[#F7F2E9]/90 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-[#B69358]" />
            <span>{seedBusy ? '불러오는 중...' : '기획안 예시 데이터 복원'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className="bg-[#272320] border border-[#B69358] text-[#F7F2E9] px-4 py-3 rounded-lg text-xs sm:text-sm flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-[#F7F2E9]/60 hover:text-[#F7F2E9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4-Column KPI Summary Strip (Proposal Section 7) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-2">
          <div className="text-xs text-[#F7F2E9]/60">
            {dateFilter === 'all' ? '전체 등록 예약' : `${dateFilter} 예약`}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl sm:text-4xl font-semibold text-[#F7F2E9] tabular-nums">
              {metrics.totalCount}
            </span>
            <span className="text-sm text-[#F7F2E9]/70">건</span>
          </div>
          <div className="text-xs text-[#B69358]">일일 최대 수용: 시간당 {storeSettings.maxSeatsPerSlot}명</div>
        </div>

        <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-2">
          <div className="text-xs text-[#F7F2E9]/60">방문 예정 (확정 · 대기)</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl sm:text-4xl font-semibold text-[#F7F2E9] tabular-nums">
              {metrics.upcomingCount}
            </span>
            <span className="text-sm text-[#F7F2E9]/70">건</span>
          </div>
          <div className="text-xs text-[#F7F2E9]/60">정상 방문 예정 테이블</div>
        </div>

        <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-2">
          <div className="text-xs text-[#F7F2E9]/60">확인 대기</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl sm:text-4xl font-semibold text-[#B69358] tabular-nums">
              {metrics.pendingCount}
            </span>
            <span className="text-sm text-[#F7F2E9]/70">건</span>
          </div>
          <div className="text-xs text-[#F7F2E9]/60">신규 접수 · 좌석 배정 필요</div>
        </div>

        <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-2">
          <div className="text-xs text-[#F7F2E9]/60">예약 총 인원 (취소 제외)</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl sm:text-4xl font-semibold text-[#F7F2E9] tabular-nums">
              {metrics.totalGuests}
            </span>
            <span className="text-sm text-[#F7F2E9]/70">명</span>
          </div>
          <div className="text-xs text-[#F7F2E9]/60">프라이빗 룸 및 홀 합산</div>
        </div>
      </div>

      {/* TAB 1: Reservation List Management */}
      {adminTab === 'reservations' && (
        <div className="space-y-6">
          {/* Filter & Search Bar */}
          <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Segmented Status Filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: '전체' },
                  { id: 'confirmed', label: '확정' },
                  { id: 'pending', label: '대기' },
                  { id: 'completed', label: '방문 완료' },
                  { id: 'cancelled', label: '취소' },
                  { id: 'noshow', label: '노쇼' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#A52A32] text-[#F7F2E9]'
                      : 'bg-[#1E1B19] text-[#F7F2E9]/70 hover:text-[#F7F2E9]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date Filter & Search Input */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-[#B69358] shrink-0" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  aria-label="방문 날짜 필터"
                  className="bg-transparent text-xs text-[#F7F2E9] focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#1E1B19]">
                    전체 날짜 보기
                  </option>
                  {distinctDates.map((d) => (
                    <option key={d} value={d} className="bg-[#1E1B19]">
                      {d} {d === '2026-11-05' ? '(기획안 기준일)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-[#F7F2E9]/45 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="예약자명, 연락처, 메뉴 검색"
                  className="w-full pl-9 pr-3 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-xs text-[#F7F2E9] placeholder:text-[#F7F2E9]/40 focus:outline-none focus:border-[#B69358]"
                />
              </div>
            </div>
          </div>

          {/* Reservations Table */}
          <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F7F2E9]/10 bg-[#1E1B19]/60 text-xs text-[#F7F2E9]/60">
                    <th className="py-3.5 px-5 font-medium">예약자 · 연락처</th>
                    <th className="py-3.5 px-4 font-medium">방문 일시</th>
                    <th className="py-3.5 px-4 font-medium">인원 · 좌석</th>
                    <th className="py-3.5 px-4 font-medium">선택 메뉴 · 요청사항</th>
                    <th className="py-3.5 px-4 font-medium">관리자 메모</th>
                    <th className="py-3.5 px-4 font-medium">상태</th>
                    <th className="py-3.5 px-5 font-medium text-right">상태 변경 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F7F2E9]/10 text-sm">
                  {filteredReservations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm text-[#F7F2E9]/60">
                        조건에 해당하는 예약 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredReservations.map((res) => {
                      const isRowBusy = busyId === res.id;
                      const isEditingMemo = editingMemoId === res.id;

                      return (
                        <tr
                          key={res.id}
                          className="hover:bg-[#1E1B19]/40 transition-colors align-top"
                        >
                          {/* Customer Name & Phone */}
                          <td className="py-4 px-5">
                            <div className="font-semibold text-[#F7F2E9]">{res.customerName}</div>
                            <div className="font-mono text-xs text-[#F7F2E9]/65 tabular-nums mt-0.5">
                              {res.customerPhone}
                            </div>
                          </td>

                          {/* Date & Time */}
                          <td className="py-4 px-4 font-mono tabular-nums">
                            <div className="text-xs text-[#F7F2E9]/80">{res.date}</div>
                            <div className="text-sm font-semibold text-[#B69358] mt-0.5">
                              {res.time}
                            </div>
                          </td>

                          {/* Party Size & Table Type */}
                          <td className="py-4 px-4">
                            <div className="font-mono font-semibold text-[#F7F2E9] tabular-nums">
                              {res.partySize}명
                            </div>
                            <div className="text-xs text-[#F7F2E9]/65 mt-0.5">
                              {TABLE_LABELS[res.tableType] || res.tableType}
                            </div>
                          </td>

                          {/* Preselected Menu & Notes */}
                          <td className="py-4 px-4 max-w-xs">
                            {res.preselectedMenu ? (
                              <div className="text-xs font-medium text-[#B69358] mb-1">
                                {res.preselectedMenu}
                              </div>
                            ) : (
                              <div className="text-xs text-[#F7F2E9]/45 mb-1">현장 메뉴 주문</div>
                            )}
                            {res.notes ? (
                              <p className="text-xs text-[#F7F2E9]/80 leading-relaxed break-words">
                                “{res.notes}”
                              </p>
                            ) : (
                              <span className="text-xs text-[#F7F2E9]/40">요청사항 없음</span>
                            )}
                          </td>

                          {/* Admin Memo */}
                          <td className="py-4 px-4 max-w-xs">
                            {isEditingMemo ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={memoDraft}
                                  maxLength={VALIDATION_RULES.ADMIN_MEMO_MAX_LENGTH}
                                  onChange={(e) => setMemoDraft(e.target.value)}
                                  placeholder="좌석 배정 및 특이사항 입력"
                                  className="w-full px-2.5 py-1.5 bg-[#1E1B19] border border-[#B69358] rounded text-xs text-[#F7F2E9] focus:outline-none"
                                />
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isRowBusy}
                                    onClick={() => handleSaveMemo(res)}
                                    className="px-2.5 py-1 bg-[#A52A32] text-[#F7F2E9] text-xs rounded cursor-pointer"
                                  >
                                    저장
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingMemoId(null)}
                                    className="px-2.5 py-1 bg-[#1E1B19] text-[#F7F2E9]/70 text-xs rounded cursor-pointer"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs text-[#F7F2E9]/75 break-words">
                                  {res.adminMemo || '배정 메모 없음'}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMemoId(res.id);
                                    setMemoDraft(res.adminMemo || '');
                                  }}
                                  className="text-xs text-[#B69358] hover:underline cursor-pointer"
                                >
                                  메모 수정
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Current Status (Clean unboxed text with semantic color & label) */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                res.status === 'confirmed'
                                  ? 'text-emerald-400'
                                  : res.status === 'pending'
                                  ? 'text-[#B69358]'
                                  : res.status === 'completed'
                                  ? 'text-sky-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {STATUS_LABELS[res.status]}
                            </span>
                          </td>

                          {/* Status Change Controls */}
                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                              {(
                                [
                                  { status: 'confirmed', label: '확정' },
                                  { status: 'pending', label: '대기' },
                                  { status: 'completed', label: '방문완료' },
                                  { status: 'cancelled', label: '취소' },
                                  { status: 'noshow', label: '노쇼' },
                                ] as const
                              ).map((btn) => (
                                <button
                                  key={btn.status}
                                  type="button"
                                  disabled={isRowBusy || res.status === btn.status}
                                  onClick={() => handleStatusChange(res, btn.status)}
                                  className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                    res.status === btn.status
                                      ? 'bg-[#F7F2E9]/15 text-[#F7F2E9] font-semibold cursor-default'
                                      : 'bg-[#1E1B19] hover:bg-[#322C28] text-[#F7F2E9]/75 hover:text-[#F7F2E9] border border-[#F7F2E9]/10'
                                  }`}
                                >
                                  {btn.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                title="예약 삭제"
                                disabled={isRowBusy}
                                onClick={() => onDeleteReservation(res.id, res.isSimulation)}
                                className="p-1.5 text-[#F7F2E9]/45 hover:text-rose-400 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Store Capacity, Time Slots, and Closed Dates Configuration */}
      {adminTab === 'settings' && (
        <form onSubmit={handleSaveSettingsSubmit} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Capacity & Operating Rules */}
            <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-[#F7F2E9]/10">
                <Sliders className="w-4 h-4 text-[#B69358]" />
                <h2 className="font-serif-kr text-lg font-semibold text-[#F7F2E9]">
                  시간대별 좌석 정원 및 매장 기본 정보
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                    시간당 최대 수용 인원(명)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={draftSettings.maxSeatsPerSlot}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        maxSeatsPerSlot: Math.max(1, Math.min(200, Number(e.target.value) || 24)),
                      })
                    }
                    className="w-full px-3 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                    시간당 최대 테이블 수
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={draftSettings.maxTablesPerSlot}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        maxTablesPerSlot: Math.max(1, Math.min(60, Number(e.target.value) || 8)),
                      })
                    }
                    className="w-full px-3 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                    1회 최대 예약 인원(명)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={draftSettings.maxPartySize}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        maxPartySize: Math.max(1, Math.min(12, Number(e.target.value) || 6)),
                      })
                    }
                    className="w-full px-3 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9]"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                    영업시간 및 브레이크타임 안내
                  </label>
                  <input
                    type="text"
                    maxLength={VALIDATION_RULES.OPEN_HOURS_MAX_LENGTH}
                    value={draftSettings.openHoursText}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, openHoursText: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">정기 휴무일 안내</label>
                    <input
                      type="text"
                      maxLength={VALIDATION_RULES.REGULAR_CLOSED_MAX_LENGTH}
                      value={draftSettings.regularClosedDay}
                      onChange={(e) =>
                        setDraftSettings({ ...draftSettings, regularClosedDay: e.target.value })
                      }
                      className="w-full px-3.5 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">예약 문의 연락처</label>
                    <input
                      type="text"
                      maxLength={VALIDATION_RULES.PHONE_MAX_LENGTH}
                      value={draftSettings.phone}
                      onChange={(e) =>
                        setDraftSettings({ ...draftSettings, phone: e.target.value })
                      }
                      className="w-full px-3.5 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono text-[#F7F2E9]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">매장 주소</label>
                  <input
                    type="text"
                    maxLength={VALIDATION_RULES.ADDRESS_MAX_LENGTH}
                    value={draftSettings.address}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, address: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                    예약 화면 고객 안내 문구
                  </label>
                  <textarea
                    rows={2}
                    maxLength={VALIDATION_RULES.NOTICE_MAX_LENGTH}
                    value={draftSettings.notice}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, notice: e.target.value })
                    }
                    className="w-full px-3.5 py-2 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                  />
                </div>
              </div>
            </div>

            {/* Time Slots & Closed Dates */}
            <div className="space-y-6">
              {/* Available Time Slots */}
              <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#F7F2E9]/10">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#B69358]" />
                    <h3 className="font-serif-kr text-base font-semibold text-[#F7F2E9]">
                      예약 가능 시간 설정
                    </h3>
                  </div>
                  <span className="text-xs text-[#F7F2E9]/60 font-mono tabular-nums">
                    총 {draftSettings.availableSlots.length}개 시간대
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {draftSettings.availableSlots.map((slot) => (
                    <div
                      key={slot}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-xs font-mono tabular-nums text-[#F7F2E9]"
                    >
                      <span>{slot}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot)}
                        className="text-[#F7F2E9]/45 hover:text-rose-400 cursor-pointer"
                        aria-label={`${slot} 시간 삭제`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="time"
                    value={newTimeSlot}
                    onChange={(e) => setNewTimeSlot(e.target.value)}
                    className="px-3 py-1.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-xs font-mono text-[#F7F2E9]"
                  />
                  <button
                    type="button"
                    onClick={handleAddSlot}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1E1B19] hover:bg-[#302B27] border border-[#B69358]/50 text-[#F7F2E9] text-xs font-medium rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B69358]" />
                    <span>시간 추가</span>
                  </button>
                </div>
              </div>

              {/* Closed Dates & Specific Blocked Slots */}
              <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-[#F7F2E9]/10">
                  <Calendar className="w-4 h-4 text-[#B69358]" />
                  <h3 className="font-serif-kr text-base font-semibold text-[#F7F2E9]">
                    휴무일 및 특정 시간대 예약 차단
                  </h3>
                </div>

                {/* Full Day Closed Dates */}
                <div className="space-y-2.5">
                  <div className="text-xs text-[#F7F2E9]/70">지정 휴무일 (전 시간 예약 차단)</div>
                  <div className="flex flex-wrap gap-2">
                    {draftSettings.closedDates.length === 0 ? (
                      <span className="text-xs text-[#F7F2E9]/45">지정된 임시 휴무일이 없습니다.</span>
                    ) : (
                      draftSettings.closedDates.map((d) => (
                        <div
                          key={d}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1E1B19] border border-rose-500/30 rounded-lg text-xs font-mono tabular-nums text-[#F7F2E9]"
                        >
                          <span>{d}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveClosedDate(d)}
                            className="text-[#F7F2E9]/45 hover:text-rose-400 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={newClosedDate}
                      onChange={(e) => setNewClosedDate(e.target.value)}
                      className="px-3 py-1.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-xs font-mono text-[#F7F2E9]"
                    />
                    <button
                      type="button"
                      onClick={handleAddClosedDate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1E1B19] hover:bg-[#302B27] border border-[#F7F2E9]/20 text-[#F7F2E9] text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#B69358]" />
                      <span>휴무일 등록</span>
                    </button>
                  </div>
                </div>

                {/* Specific Date+Time Block */}
                <div className="space-y-2.5 pt-3 border-t border-[#F7F2E9]/10">
                  <div className="text-xs text-[#F7F2E9]/70">
                    특정 날짜 · 시간 예약 마감 차단 (단체 대관 등)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draftSettings.blockedSlotKeys.length === 0 ? (
                      <span className="text-xs text-[#F7F2E9]/45">차단된 특정 시간대가 없습니다.</span>
                    ) : (
                      draftSettings.blockedSlotKeys.map((key) => (
                        <div
                          key={key}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1E1B19] border border-[#B69358]/35 rounded-lg text-xs font-mono tabular-nums text-[#F7F2E9]"
                        >
                          <span>{key.replace('_', ' · ')}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBlockedSlotKey(key)}
                            className="text-[#F7F2E9]/45 hover:text-rose-400 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={newBlockDate}
                      onChange={(e) => setNewBlockDate(e.target.value)}
                      className="px-3 py-1.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-xs font-mono text-[#F7F2E9]"
                    />
                    <select
                      value={newBlockTime}
                      onChange={(e) => setNewBlockTime(e.target.value)}
                      className="px-3 py-1.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-xs font-mono text-[#F7F2E9]"
                    >
                      {draftSettings.availableSlots.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddBlockedSlotKey}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1E1B19] hover:bg-[#302B27] border border-[#F7F2E9]/20 text-[#F7F2E9] text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#B69358]" />
                      <span>시간 차단 추가</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? '설정 저장 중...' : '매장 설정 저장 및 예약 화면 반영'}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
