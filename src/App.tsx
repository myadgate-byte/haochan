import React, { useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Calendar,
  Clock,
  Users,
  MapPin,
  Phone,
  CheckCircle2,
  X,
  LogIn,
  LogOut,
  ChevronRight,
  Utensils,
  Sparkles,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  ADMIN_EMAIL,
  OperationType,
  handleFirestoreError,
} from './firebase';
import {
  Reservation,
  ReservationStatus,
  StoreSettings,
  TableType,
  MenuCategory,
  MenuItem,
  DailyAvailability,
  VALIDATION_RULES,
} from './types';
import {
  PROMPT_IMAGES,
  DEFAULT_STORE_SETTINGS,
  HAOCHAN_MENUS,
  HAOCHAN_SPACES,
  SAMPLE_RESERVATIONS,
} from './data/haochanData';
import { VisualAsset } from './components/VisualAsset';
import { AdminDashboard } from './components/AdminDashboard';

type ActiveView = 'home' | 'menu' | 'reservation' | 'lookup' | 'admin';

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: '예약 대기',
  confirmed: '예약 확정',
  completed: '방문 완료',
  cancelled: '예약 취소',
  noshow: '미방문(노쇼)',
};

const TABLE_LABELS: Record<TableType, string> = {
  hall: '메인 다이닝 홀',
  window: '테라스 뷰 창가석',
  private_room: '프라이빗 룸',
};

export default function App() {
  // Navigation & Modal State
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedMenuModal, setSelectedMenuModal] = useState<MenuItem | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Auth & Profile State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [profilePhone, setProfilePhone] = useState<string>('010-1234-5678');
  const [authError, setAuthError] = useState<string | null>(null);

  // Store Settings & Availability
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [dailyAvailability, setDailyAvailability] = useState<DailyAvailability | null>(null);

  // Reservations State (Firestore + Local Simulation Preview)
  const [firestoreReservations, setFirestoreReservations] = useState<Reservation[]>([]);
  const [simulationReservations, setSimulationReservations] =
    useState<Reservation[]>(SAMPLE_RESERVATIONS);

  // Menu Filter State
  const [menuCategory, setMenuCategory] = useState<MenuCategory>('all');

  // Customer Reservation Form State (Defaulting to proposal example: 2026-11-05 · 18:30 · 2명)
  const [visitDate, setVisitDate] = useState<string>('2026-11-05');
  const [partySize, setPartySize] = useState<number>(2);
  const [visitTime, setVisitTime] = useState<string>('18:30');
  const [tableType, setTableType] = useState<TableType>('hall');
  const [preselectedMenu, setPreselectedMenu] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submittingBooking, setSubmittingBooking] = useState<boolean>(false);
  const [confirmedModalReservation, setConfirmedModalReservation] =
    useState<Reservation | null>(null);
  const [bookingFeedback, setBookingFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    reservation?: Reservation;
  } | null>(null);

  // Format phone number helper (e.g. 01012345678 -> 010-1234-5678)
  const formatPhoneNumber = (raw: string): string => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9)
        return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 9)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  // Lookup Filter for non-logged-in or quick search
  const [lookupPhoneFilter, setLookupPhoneFilter] = useState<string>('');

  const isAdmin = useMemo(() => {
    return Boolean(
      currentUser &&
        currentUser.emailVerified &&
        currentUser.email === ADMIN_EMAIL
    );
  }, [currentUser]);

  // 1. Firebase Auth Listener & User Profile Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);

      if (user) {
        setCustomerName((prev) => prev || user.displayName || '하오찬 고객');
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.phone) {
              setProfilePhone(data.phone);
              setCustomerPhone((prev) => prev || data.phone);
            }
            if (data.name) {
              setCustomerName((prev) => prev || data.name);
            }
          } else if (user.emailVerified) {
            const safeName = (user.displayName || '하오찬 회원').slice(
              0,
              VALIDATION_RULES.NAME_MAX_LENGTH
            );
            const safeEmail = (user.email || 'guest@haochan.kr').slice(
              0,
              VALIDATION_RULES.EMAIL_MAX_LENGTH
            );
            await setDoc(userRef, {
              uid: user.uid,
              name: safeName,
              email: safeEmail,
              phone: '010-0000-0000',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn('Profile sync warning:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Load Store Settings (/storeSettings/main) when authenticated
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    let isCancelled = false;
    const settingsRef = doc(db, 'storeSettings', 'main');
    getDoc(settingsRef)
      .then((snap) => {
        if (!isCancelled && snap.exists()) {
          const data = snap.data() as StoreSettings;
          const isOldAddress =
            !data.address || data.address.includes('도산대로');
          const isOldPhone =
            !data.phone || data.phone === '02-548-8892';
          setStoreSettings({
            ...DEFAULT_STORE_SETTINGS,
            ...data,
            address: isOldAddress
              ? DEFAULT_STORE_SETTINGS.address
              : data.address,
            phone: isOldPhone ? DEFAULT_STORE_SETTINGS.phone : data.phone,
          });
        }
      })
      .catch((err) => {
        console.warn('Store settings fallback to default:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [isAuthReady, currentUser]);

  // 3. Load Daily Availability for Selected Date (/dailyAvailability/{visitDate}) when authenticated
  useEffect(() => {
    if (!isAuthReady || !currentUser) {
      setDailyAvailability(null);
      return;
    }
    if (!VALIDATION_RULES.DATE_PATTERN.test(visitDate)) return;

    let isCancelled = false;
    const availRef = doc(db, 'dailyAvailability', visitDate);
    getDoc(availRef)
      .then((snap) => {
        if (isCancelled) return;
        if (snap.exists()) {
          setDailyAvailability(snap.data() as DailyAvailability);
        } else {
          setDailyAvailability(null);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setDailyAvailability(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isAuthReady, currentUser, visitDate]);

  // 4. Subscribe to Firestore Reservations (Admin gets all; Verified User gets own)
  useEffect(() => {
    if (!isAuthReady || !currentUser) {
      setFirestoreReservations([]);
      return;
    }

    const reservationsCol = collection(db, 'reservations');
    const q = isAdmin
      ? reservationsCol
      : query(reservationsCol, where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Reservation[] = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<Reservation, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => `${b.date}_${b.time}`.localeCompare(`${a.date}_${a.time}`));
        setFirestoreReservations(list);
      },
      (error) => {
        console.warn('Reservations listener fallback:', error);
      }
    );

    return () => unsubscribe();
  }, [isAuthReady, currentUser, isAdmin]);

  // Combined reservations for Admin Dashboard (merges Firestore & local session bookings without duplicates)
  const combinedAdminReservations = useMemo(() => {
    const map = new Map<string, Reservation>();
    firestoreReservations.forEach((r) => map.set(r.id, r));
    simulationReservations.forEach((r) => {
      if (!map.has(r.id)) {
        map.set(r.id, r);
      }
    });
    const list = Array.from(map.values());
    list.sort((a, b) => `${b.date}_${b.time}`.localeCompare(`${a.date}_${a.time}`));
    return list;
  }, [firestoreReservations, simulationReservations]);

  const myReservations = useMemo(() => {
    const userSimulations = simulationReservations.filter(
      (r) =>
        !r.id.startsWith('sample-res-') ||
        (lookupPhoneFilter.trim() !== '' &&
          r.customerPhone.includes(lookupPhoneFilter.trim()))
    );
    const map = new Map<string, Reservation>();
    firestoreReservations.forEach((r) => map.set(r.id, r));
    userSimulations.forEach((r) => {
      if (!map.has(r.id)) {
        map.set(r.id, r);
      }
    });
    const merged = Array.from(map.values());
    if (lookupPhoneFilter.trim() !== '') {
      return merged.filter((r) =>
        r.customerPhone.includes(lookupPhoneFilter.trim())
      );
    }
    return merged;
  }, [firestoreReservations, simulationReservations, lookupPhoneFilter]);

  // Compute booked seats per slot on `visitDate`
  const slotRemainingSeatsMap = useMemo(() => {
    const map: Record<string, number> = {};
    let parsedSummary: Record<string, number> = {};

    if (dailyAvailability?.slotSummary) {
      try {
        parsedSummary = JSON.parse(dailyAvailability.slotSummary);
      } catch {
        parsedSummary = {};
      }
    }

    storeSettings.availableSlots.forEach((slot) => {
      const localBooked = combinedAdminReservations
        .filter(
          (r) =>
            r.date === visitDate &&
            r.time === slot &&
            r.status !== 'cancelled' &&
            r.status !== 'noshow'
        )
        .reduce((sum, r) => sum + r.partySize, 0);

      const serverBooked = parsedSummary[slot] || 0;
      const usedSeats = Math.max(localBooked, serverBooked);
      map[slot] = Math.max(0, storeSettings.maxSeatsPerSlot - usedSeats);
    });

    return map;
  }, [
    visitDate,
    storeSettings.availableSlots,
    storeSettings.maxSeatsPerSlot,
    dailyAvailability,
    combinedAdminReservations,
  ]);

  const isSelectedDateClosed = useMemo(() => {
    return storeSettings.closedDates.includes(visitDate);
  }, [storeSettings.closedDates, visitDate]);

  // Filtered menus
  const displayedMenus = useMemo(() => {
    if (menuCategory === 'all') return HAOCHAN_MENUS;
    return HAOCHAN_MENUS.filter((m) => m.category === menuCategory);
  }, [menuCategory]);

  // Handlers
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthModalOpen(false);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : '로그인 창을 여는 중 문제가 발생했습니다. 다시 시도해 주세요.'
      );
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    if (activeView === 'admin') {
      setActiveView('home');
    }
  };

  const jumpToReservationWithPreset = (options?: {
    menuName?: string;
    spaceType?: TableType;
  }) => {
    if (options?.menuName !== undefined) {
      setPreselectedMenu(options.menuName);
    }
    if (options?.spaceType !== undefined) {
      setTableType(options.spaceType);
      if (options.spaceType === 'private_room' && partySize < 4) {
        setPartySize(4);
      }
    }
    setSelectedMenuModal(null);
    setBookingFeedback(null);
    setActiveView('reservation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync DailyAvailability aggregate document in Firestore
  const syncDailyAvailabilityInFirestore = async (
    targetDate: string,
    slotDelta: { time: string; guestsDelta: number; bookingDelta: number }
  ) => {
    if (!currentUser || !currentUser.emailVerified) return;
    const availRef = doc(db, 'dailyAvailability', targetDate);
    try {
      const snap = await getDoc(availRef);
      let currentSummary: Record<string, number> = {};
      let totalActiveBookings = 0;
      let totalActiveGuests = 0;

      if (snap.exists()) {
        const data = snap.data() as DailyAvailability;
        totalActiveBookings = data.totalActiveBookings || 0;
        totalActiveGuests = data.totalActiveGuests || 0;
        try {
          currentSummary = JSON.parse(data.slotSummary || '{}');
        } catch {
          currentSummary = {};
        }
      }

      currentSummary[slotDelta.time] = Math.max(
        0,
        (currentSummary[slotDelta.time] || 0) + slotDelta.guestsDelta
      );
      const nextBookings = Math.max(0, totalActiveBookings + slotDelta.bookingDelta);
      const nextGuests = Math.max(0, totalActiveGuests + slotDelta.guestsDelta);
      const summaryStr = JSON.stringify(currentSummary).slice(0, 600);

      if (snap.exists()) {
        await updateDoc(availRef, {
          totalActiveBookings: nextBookings,
          totalActiveGuests: nextGuests,
          slotSummary: summaryStr,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(availRef, {
          date: targetDate,
          totalActiveBookings: nextBookings,
          totalActiveGuests: nextGuests,
          slotSummary: summaryStr,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('Availability counter update skipped:', err);
    }
  };

  // Submit Customer Reservation
  const handleReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingFeedback(null);

    const cleanName = customerName.trim().slice(0, VALIDATION_RULES.NAME_MAX_LENGTH);
    const formattedPhone = formatPhoneNumber(customerPhone.trim());
    const cleanPhone = formattedPhone.slice(0, VALIDATION_RULES.PHONE_MAX_LENGTH);
    const cleanNotes = notes.trim().slice(0, VALIDATION_RULES.NOTES_MAX_LENGTH);
    const cleanMenu = preselectedMenu
      .trim()
      .slice(0, VALIDATION_RULES.PRESELECTED_MENU_MAX_LENGTH);

    if (!cleanName) {
      setBookingFeedback({
        type: 'error',
        message: '우측 입력란에 예약자 성함을 입력해 주세요. (예: 김민수)',
      });
      return;
    }

    if (
      cleanPhone.length < VALIDATION_RULES.PHONE_MIN_LENGTH ||
      !VALIDATION_RULES.PHONE_PATTERN.test(cleanPhone)
    ) {
      setBookingFeedback({
        type: 'error',
        message: '우측 입력란에 연락처를 입력해 주세요. (예: 010-1234-5678)',
      });
      return;
    }

    if (isSelectedDateClosed) {
      setBookingFeedback({
        type: 'error',
        message: '선택하신 날짜는 매장 지정 휴무일입니다. 다른 날짜를 선택해 주세요.',
      });
      return;
    }

    const slotKey = `${visitDate}_${visitTime}`;
    if (storeSettings.blockedSlotKeys.includes(slotKey)) {
      setBookingFeedback({
        type: 'error',
        message: '선택하신 시간대는 예약이 마감되었습니다. 다른 시간을 선택해 주세요.',
      });
      return;
    }

    const remainingSeats = slotRemainingSeatsMap[visitTime] ?? storeSettings.maxSeatsPerSlot;
    if (remainingSeats < partySize) {
      setBookingFeedback({
        type: 'error',
        message: `선택하신 시간대의 잔여 좌석(${remainingSeats}석)이 예약 인원(${partySize}명)보다 부족합니다.`,
      });
      return;
    }

    setSubmittingBooking(true);

    try {
      const generatedId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const createdRecord: Reservation = {
        id: generatedId,
        userId: currentUser ? currentUser.uid : 'guest_simulation',
        customerName: cleanName,
        customerPhone: cleanPhone,
        customerEmail: (currentUser?.email || 'guest@haochan.kr').slice(
          0,
          VALIDATION_RULES.EMAIL_MAX_LENGTH
        ),
        date: visitDate,
        time: visitTime,
        partySize,
        tableType,
        preselectedMenu: cleanMenu,
        notes: cleanNotes,
        adminMemo: '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSimulation: !currentUser,
      };

      // Immediately reflect in UI state so it appears in Lookup & Admin without delay
      setSimulationReservations((prev) => [createdRecord, ...prev]);

      // If authenticated with Google, also persist to Firestore with a 3.5s timeout guard
      if (currentUser && currentUser.emailVerified) {
        const reservationPayload = {
          userId: currentUser.uid,
          customerName: cleanName,
          customerPhone: cleanPhone,
          customerEmail: (currentUser.email || 'member@haochan.kr').slice(
            0,
            VALIDATION_RULES.EMAIL_MAX_LENGTH
          ),
          date: visitDate,
          time: visitTime,
          partySize,
          tableType,
          preselectedMenu: cleanMenu,
          notes: cleanNotes,
          adminMemo: '',
          status: 'pending' as ReservationStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        try {
          await Promise.race([
            setDoc(doc(db, 'reservations', generatedId), reservationPayload),
            new Promise((_, reject) =>
              window.setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 3500)
            ),
          ]);
          void syncDailyAvailabilityInFirestore(visitDate, {
            time: visitTime,
            guestsDelta: partySize,
            bookingDelta: 1,
          });
        } catch (err) {
          console.warn('Firestore write fallback to local session state:', err);
        }
      }

      setBookingFeedback({
        type: 'success',
        message:
          '하오찬 테이블 예약 신청이 정상적으로 접수되었습니다. [내 예약 조회] 및 [관리자 전용] 메뉴에서 바로 확인하실 수 있습니다.',
        reservation: createdRecord,
      });
      setConfirmedModalReservation(createdRecord);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Customer Cancel Reservation
  const handleCustomerCancel = async (res: Reservation) => {
    if (res.isSimulation || !currentUser) {
      setSimulationReservations((prev) =>
        prev.map((item) =>
          item.id === res.id ? { ...item, status: 'cancelled' } : item
        )
      );
      return;
    }

    try {
      await updateDoc(doc(db, 'reservations', res.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await syncDailyAvailabilityInFirestore(res.date, {
        time: res.time,
        guestsDelta: -res.partySize,
        bookingDelta: -1,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reservations/${res.id}`);
    }
  };

  // Admin Update Reservation Status / Memo
  const handleAdminUpdateReservation = async (
    res: Reservation,
    nextStatus: ReservationStatus,
    nextMemo?: string
  ) => {
    const memoToSave =
      nextMemo !== undefined
        ? nextMemo.slice(0, VALIDATION_RULES.ADMIN_MEMO_MAX_LENGTH)
        : res.adminMemo;

    if (res.isSimulation || !isAdmin) {
      setSimulationReservations((prev) =>
        prev.map((item) =>
          item.id === res.id
            ? { ...item, status: nextStatus, adminMemo: memoToSave }
            : item
        )
      );
      return;
    }

    try {
      await updateDoc(doc(db, 'reservations', res.id), {
        status: nextStatus,
        adminMemo: memoToSave,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reservations/${res.id}`);
    }
  };

  // Admin Delete Reservation
  const handleAdminDeleteReservation = async (
    reservationId: string,
    isSimulation?: boolean
  ) => {
    if (isSimulation || !isAdmin) {
      setSimulationReservations((prev) =>
        prev.filter((item) => item.id !== reservationId)
      );
      return;
    }

    try {
      await deleteDoc(doc(db, 'reservations', reservationId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reservations/${reservationId}`);
    }
  };

  // Admin Seed Proposal Sample Reservations
  const handleSeedSampleReservations = async () => {
    setSimulationReservations(SAMPLE_RESERVATIONS);

    if (isAdmin && currentUser) {
      for (const sample of SAMPLE_RESERVATIONS) {
        const docId = `haochan_${sample.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        try {
          await setDoc(doc(db, 'reservations', docId), {
            userId: currentUser.uid,
            customerName: sample.customerName,
            customerPhone: sample.customerPhone,
            customerEmail: sample.customerEmail,
            date: sample.date,
            time: sample.time,
            partySize: sample.partySize,
            tableType: sample.tableType,
            preselectedMenu: sample.preselectedMenu,
            notes: sample.notes,
            adminMemo: sample.adminMemo,
            status: sample.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `reservations/${docId}`);
        }
      }
    }
  };

  // Admin Save Store Settings
  const handleSaveStoreSettings = async (nextSettings: StoreSettings) => {
    setStoreSettings(nextSettings);

    if (isAdmin && currentUser) {
      const settingsRef = doc(db, 'storeSettings', 'main');
      const payload = {
        maxSeatsPerSlot: nextSettings.maxSeatsPerSlot,
        maxTablesPerSlot: nextSettings.maxTablesPerSlot,
        maxPartySize: nextSettings.maxPartySize,
        availableSlots: nextSettings.availableSlots.slice(0, 20),
        closedDates: nextSettings.closedDates.slice(0, 60),
        blockedSlotKeys: nextSettings.blockedSlotKeys.slice(0, 60),
        regularClosedDay: nextSettings.regularClosedDay.slice(
          0,
          VALIDATION_RULES.REGULAR_CLOSED_MAX_LENGTH
        ),
        openHoursText: nextSettings.openHoursText.slice(
          0,
          VALIDATION_RULES.OPEN_HOURS_MAX_LENGTH
        ),
        phone: nextSettings.phone.slice(0, VALIDATION_RULES.PHONE_MAX_LENGTH),
        address: nextSettings.address.slice(0, VALIDATION_RULES.ADDRESS_MAX_LENGTH),
        notice: nextSettings.notice.slice(0, VALIDATION_RULES.NOTICE_MAX_LENGTH),
        updatedAt: serverTimestamp(),
      };

      try {
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          await updateDoc(settingsRef, payload);
        } else {
          await setDoc(settingsRef, payload);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'storeSettings/main');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#1E1B19] text-[#F7F2E9]">
      {/* TOP BAR CONTRACT: Strictly 1 row, 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-[#1E1B19]/95 backdrop-blur-md border-b border-[#F7F2E9]/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element wordmark in Korean only ('하오찬') */}
          <button
            type="button"
            onClick={() => {
              setActiveView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-serif-kr text-2xl font-bold tracking-tight text-[#F7F2E9] hover:text-[#B69358] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            하오찬
          </button>

          {/* Zone 2: 5 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#F7F2E9]/75">
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'home'
                  ? 'border-[#B69358] text-[#F7F2E9]'
                  : 'border-transparent hover:text-[#F7F2E9]'
              }`}
            >
              하오찬 소개
            </button>
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'menu'
                  ? 'border-[#B69358] text-[#F7F2E9]'
                  : 'border-transparent hover:text-[#F7F2E9]'
              }`}
            >
              전체 메뉴
            </button>
            <button
              type="button"
              onClick={() => setActiveView('reservation')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'reservation'
                  ? 'border-[#B69358] text-[#F7F2E9]'
                  : 'border-transparent hover:text-[#F7F2E9]'
              }`}
            >
              예약하기
            </button>
            <button
              type="button"
              onClick={() => setActiveView('lookup')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'lookup'
                  ? 'border-[#B69358] text-[#F7F2E9]'
                  : 'border-transparent hover:text-[#F7F2E9]'
              }`}
            >
              예약 조회
            </button>
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'admin'
                  ? 'border-[#B69358] text-[#B69358]'
                  : 'border-transparent text-[#B69358]/85 hover:text-[#B69358]'
              }`}
            >
              관리자 전용
            </button>
          </nav>

          {/* Zone 3: 1 primary action button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (activeView !== 'reservation') {
                  setActiveView('reservation');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  setAuthModalOpen(true);
                }
              }}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#F7F2E9] bg-[#A52A32] hover:bg-[#8E2229] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {currentUser ? `${currentUser.displayName || '회원'} · 예약하기` : '지금 예약하기'}
            </button>
          </div>
        </div>

        {/* Mobile Secondary Quick Nav Bar (stays within 15% mobile sticky cap) */}
        <div className="flex md:hidden items-center justify-around border-t border-[#F7F2E9]/10 bg-[#181513] px-2 py-2 text-xs">
          {(
            [
              { id: 'home', label: '소개' },
              { id: 'menu', label: '전체 메뉴' },
              { id: 'reservation', label: '예약하기' },
              { id: 'lookup', label: '예약 조회' },
              { id: 'admin', label: '관리자' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === item.id
                  ? 'text-[#B69358] font-semibold'
                  : 'text-[#F7F2E9]/70'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1">
        {/* =========================================================
            VIEW 1: HOME (메인 비주얼 · 소개 · 대표 메뉴 · 매장 공간 · 예약 안내 · 오시는 길)
           ========================================================= */}
        {activeView === 'home' && (
          <div>
            {/* 1. 메인 비주얼 (Hero Split + Full-Width Quick Booking Bar) */}
            <section className="relative border-b border-[#F7F2E9]/10">
              <div className="max-w-7xl mx-auto px-6 py-12 lg:py-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                  {/* Left Editorial Copy */}
                  <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
                    <div className="text-xs sm:text-sm text-[#B69358] tracking-widest">
                      중식의 즐거움을 담은 공간 · 맛있는 한 끼, 특별한 만남
                    </div>

                    <h1
                      className="font-serif-kr text-3xl sm:text-5xl lg:text-[3.35rem] font-bold text-[#F7F2E9] leading-[1.22]"
                      style={{ textWrap: 'balance' }}
                    >
                      좋은 음식이 있는 곳에, 좋은 시간이 머뭅니다.
                    </h1>

                    <p className="text-base sm:text-lg text-[#F7F2E9]/80 leading-relaxed max-w-2xl">
                      하오찬에서 풍미로운 중식과 함께 소중한 사람들과 특별한 시간을 만들어 보세요.
                      깊은 불향의 일품 요리부터 독립된 프라이빗 룸 코스까지 정성껏 준비합니다.
                    </p>

                    <div className="flex flex-wrap items-center gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => jumpToReservationWithPreset()}
                        className="px-6 py-3.5 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        지금 예약하기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('menu');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-6 py-3.5 bg-[#272320] hover:bg-[#322C28] border border-[#B69358]/45 text-[#F7F2E9] text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        메뉴 둘러보기
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthModalOpen(true)}
                        className="px-4 py-3.5 text-xs sm:text-sm text-[#B69358] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {currentUser ? '내 계정 · 예약 관리' : '로그인 / 회원가입'}
                      </button>
                    </div>
                  </div>

                  {/* Right Hero Visual Showcase */}
                  <div className="lg:col-span-5 relative group rounded-2xl overflow-hidden border border-[#F7F2E9]/15 min-h-[340px] lg:min-h-[440px]">
                    <VisualAsset
                      src={PROMPT_IMAGES.heroDining}
                      alt="하오찬 시그니처 중식 다이닝 상차림"
                      variant="hero"
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent z-20 flex flex-col justify-end p-6">
                      <div className="text-xs text-[#B69358] mb-1">
                        하오찬 시그니처 다이닝 · 송파 가락로 본점
                      </div>
                      <p className="font-serif-kr text-lg font-semibold text-[#F7F2E9]">
                        300°C 무쇠 웍의 불향과 제철 식재료의 조화
                      </p>
                      <div className="text-xs text-[#F7F2E9]/70 mt-1 font-mono tabular-nums">
                        서울 송파구 가락로28길 11 서울빌딩 1층 · {storeSettings.phone}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full-Width Quick Reservation Strip below the Hero Split */}
                <div className="mt-10 bg-[#272320] border border-[#B69358]/35 rounded-xl p-5 lg:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div>
                      <label className="block text-xs text-[#B69358] mb-1.5">방문 날짜 선택</label>
                      <input
                        type="date"
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#B69358] mb-1.5">예약 인원</label>
                      <select
                        value={partySize}
                        onChange={(e) => setPartySize(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9]"
                      >
                        {Array.from(
                          { length: storeSettings.maxPartySize },
                          (_, idx) => idx + 1
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}명 방문
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#B69358] mb-1.5">희망 시간</label>
                      <select
                        value={visitTime}
                        onChange={(e) => setVisitTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9]"
                      >
                        {storeSettings.availableSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot} (잔여 {slotRemainingSeatsMap[slot] ?? storeSettings.maxSeatsPerSlot}석)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#B69358] mb-1.5">선호 좌석 구역</label>
                      <select
                        value={tableType}
                        onChange={(e) => setTableType(e.target.value as TableType)}
                        className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                      >
                        <option value="hall">메인 다이닝 홀</option>
                        <option value="window">테라스 뷰 창가석</option>
                        <option value="private_room">프라이빗 룸 (4인 이상)</option>
                      </select>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => jumpToReservationWithPreset()}
                        className="w-full py-2.5 px-4 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        이 일정으로 예약 진행
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. 하오찬 소개: 평범한 하루에도 특별한 맛의 순간을 */}
            <section className="max-w-7xl mx-auto px-6 py-20 border-b border-[#F7F2E9]/10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-5 space-y-5">
                  <div className="text-xs text-[#B69358] tracking-widest">
                    01. 하오찬 소개 · 브랜드 철학
                  </div>
                  <h2
                    className="font-serif-kr text-2xl sm:text-4xl font-bold text-[#F7F2E9] leading-tight"
                    style={{ textWrap: 'balance' }}
                  >
                    평범한 하루에도 특별한 맛의 순간을
                  </h2>
                  <p className="text-sm sm:text-base text-[#F7F2E9]/75 leading-relaxed">
                    ‘하오찬’은 좋은 식사와 따뜻한 환대를 뜻합니다. 매일 새벽 산지에서 직송되는 완도산 활전복과 국내산 암퇘지, 그리고 25년 경력 중식 마스터 셰프의 정교한 화공(火功)으로 재료 본연의 깊은 맛을 끌어올립니다.
                  </p>
                  <p className="text-sm sm:text-base text-[#F7F2E9]/75 leading-relaxed">
                    자극적인 조미료 대신 12시간 우려낸 육수와 직접 숙성한 발효 간장·고추기름을 사용하여 식사 후에도 편안한 여운을 선사합니다.
                  </p>
                </div>

                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-3">
                    <div className="font-mono text-xs text-[#B69358]">01 · 食材</div>
                    <h3 className="font-serif-kr text-lg font-semibold text-[#F7F2E9]">
                      당일 직송 제철 식재료
                    </h3>
                    <p className="text-xs sm:text-sm text-[#F7F2E9]/70 leading-relaxed">
                      완도 활전복, 자연산 대하, 국내산 1등급 한돈 등 매일 아침 검수한 최상급 식재료만 조리대에 올립니다.
                    </p>
                  </div>

                  <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-3">
                    <div className="font-mono text-xs text-[#B69358]">02 · 火功</div>
                    <h3 className="font-serif-kr text-lg font-semibold text-[#F7F2E9]">
                      주문 즉시 볶아내는 불향
                    </h3>
                    <p className="text-xs sm:text-sm text-[#F7F2E9]/70 leading-relaxed">
                      미리 만들어 두지 않고 고객의 착석 시간에 맞추어 300°C 무쇠 웍에서 즉석 조리해 최상의 온도로 제공합니다.
                    </p>
                  </div>

                  <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-3">
                    <div className="font-mono text-xs text-[#B69358]">03 · 空間</div>
                    <h3 className="font-serif-kr text-lg font-semibold text-[#F7F2E9]">
                      프라이빗 맞춤 다이닝
                    </h3>
                    <p className="text-xs sm:text-sm text-[#F7F2E9]/70 leading-relaxed">
                      2인 창가 데이트석부터 최대 12인 단독 회전 테이블 룸까지 모임의 성격에 맞춘 세심한 좌석 배정을 지원합니다.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. 대표 메뉴: 오늘, 어떤 맛을 만나고 싶으신가요? */}
            <section className="max-w-7xl mx-auto px-6 py-20 border-b border-[#F7F2E9]/10 space-y-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="space-y-2">
                  <div className="text-xs text-[#B69358] tracking-widest">
                    02. 대표 메뉴 · 미식 컬렉션
                  </div>
                  <h2 className="font-serif-kr text-2xl sm:text-4xl font-bold text-[#F7F2E9]">
                    오늘, 어떤 맛을 만나고 싶으신가요?
                  </h2>
                  <p className="text-sm text-[#F7F2E9]/70">
                    원하시는 메뉴를 선택해 상세 설명을 확인하거나 해당 메뉴를 포함하여 바로 테이블을 예약하실 수 있습니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveView('menu');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#B69358] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>전체 메뉴판 보기</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* 3-Column Featured Collection Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {HAOCHAN_MENUS.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="group bg-[#272320] border border-[#F7F2E9]/10 rounded-xl overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div>
                      <div
                        onClick={() => setSelectedMenuModal(item)}
                        className="aspect-[4/3] w-full cursor-pointer overflow-hidden"
                      >
                        <VisualAsset
                          src={item.imageUrl}
                          alt={item.name}
                          variant={item.artworkVariant}
                          className="w-full h-full"
                        />
                      </div>

                      <div className="p-6 space-y-3">
                        {/* Clean unboxed metadata with middle dot separator */}
                        <div className="flex items-center gap-2 text-xs text-[#B69358]">
                          <span>{item.categoryLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.servingInfo}</span>
                        </div>

                        <div className="flex items-baseline justify-between gap-3">
                          <h3
                            onClick={() => setSelectedMenuModal(item)}
                            className="font-serif-kr text-lg font-semibold text-[#F7F2E9] group-hover:text-[#B69358] transition-colors cursor-pointer"
                          >
                            {item.name}
                          </h3>
                          <span className="font-mono text-base font-semibold text-[#F7F2E9] tabular-nums shrink-0">
                            {item.price.toLocaleString()}원
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-[#F7F2E9]/70 leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3 border-t border-[#F7F2E9]/10">
                      <button
                        type="button"
                        onClick={() => setSelectedMenuModal(item)}
                        className="text-xs text-[#F7F2E9]/75 hover:text-[#F7F2E9] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        상세 정보 보기
                      </button>
                      <button
                        type="button"
                        onClick={() => jumpToReservationWithPreset({ menuName: item.name })}
                        className="px-3.5 py-2 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        이 메뉴로 예약하기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. 매장 공간: 소중한 사람과 함께하는 편안한 식사 */}
            <section className="max-w-7xl mx-auto px-6 py-20 border-b border-[#F7F2E9]/10 space-y-10">
              <div className="space-y-2 max-w-2xl">
                <div className="text-xs text-[#B69358] tracking-widest">
                  03. 매장 공간 · 프라이빗 룸 및 홀 안내
                </div>
                <h2 className="font-serif-kr text-2xl sm:text-4xl font-bold text-[#F7F2E9]">
                  소중한 사람과 함께하는 편안한 식사
                </h2>
                <p className="text-sm text-[#F7F2E9]/70 leading-relaxed">
                  고급스럽고 아늑한 조도와 목재 파티션이 어우러진 하오찬의 다이닝 공간입니다. 모임의 목적에 맞는 좌석을 미리 지정하여 예약해 보세요.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {HAOCHAN_SPACES.map((space) => (
                  <div
                    key={space.id}
                    className="group bg-[#272320] border border-[#F7F2E9]/10 rounded-xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[16/10] w-full overflow-hidden">
                        <VisualAsset
                          src={space.imageUrl}
                          alt={space.name}
                          variant="interior"
                          className="w-full h-full"
                        />
                      </div>

                      <div className="p-6 space-y-3">
                        <div className="text-xs text-[#B69358] font-mono">
                          {space.capacityText}
                        </div>
                        <h3 className="font-serif-kr text-xl font-semibold text-[#F7F2E9]">
                          {space.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#F7F2E9]/75 leading-relaxed">
                          {space.description}
                        </p>
                        <div className="pt-2 text-xs text-[#F7F2E9]/60">
                          추천 모임: <span className="text-[#F7F2E9]/90">{space.recommendedFor}</span>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 pb-6 pt-3 border-t border-[#F7F2E9]/10 flex items-center justify-between">
                      <span className="text-xs text-[#B69358]">
                        {space.features.join(' · ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => jumpToReservationWithPreset({ spaceType: space.id })}
                        className="px-3.5 py-2 bg-[#1E1B19] hover:bg-[#A52A32] border border-[#F7F2E9]/15 text-[#F7F2E9] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        이 좌석 예약
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. 예약 안내 Banner: 좋은 자리는 미리 준비하세요 */}
            <section className="max-w-7xl mx-auto px-6 py-20 border-b border-[#F7F2E9]/10">
              <div className="bg-[#272320] border border-[#B69358]/40 rounded-2xl p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-3 max-w-2xl">
                  <div className="text-xs text-[#B69358] tracking-widest">
                    04. 온라인 실시간 테이블 예약 안내
                  </div>
                  <h2 className="font-serif-kr text-2xl sm:text-4xl font-bold text-[#F7F2E9]">
                    좋은 자리는 미리 준비하세요.
                  </h2>
                  <p className="text-sm sm:text-base text-[#F7F2E9]/75 leading-relaxed">
                    방문 날짜와 인원, 희망 시간대를 선택하시면 실시간 잔여 좌석을 확인하고 즉시 예약을 접수하실 수 있습니다. {storeSettings.notice}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => jumpToReservationWithPreset()}
                    className="px-6 py-3.5 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    하오찬 테이블 예약하기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('lookup');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-5 py-3.5 bg-[#1E1B19] hover:bg-[#322C28] border border-[#F7F2E9]/15 text-[#F7F2E9] text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    내 예약 조회 · 변경
                  </button>
                </div>
              </div>
            </section>

            {/* 6. 오시는 길: 주소, 지도, 영업시간, 연락처 */}
            <section className="max-w-7xl mx-auto px-6 py-20">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 space-y-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="text-xs text-[#B69358] tracking-widest">
                      05. 오시는 길 · 영업시간 및 주차 안내
                    </div>
                    <h2 className="font-serif-kr text-2xl sm:text-4xl font-bold text-[#F7F2E9]">
                      하오찬 오시는 길
                    </h2>
                    <p className="text-sm text-[#F7F2E9]/70 leading-relaxed">
                      서울 송파구 가락로28길 11 서울빌딩 1층에 위치해 있습니다. 송파역·방이역에서 접근이 편리하며 건물 내 주차 안내를 지원합니다.
                    </p>
                  </div>

                  <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 space-y-4 text-sm">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-[#B69358] shrink-0 mt-1" />
                      <div>
                        <div className="text-xs text-[#F7F2E9]/55">도로명 주소</div>
                        <div className="text-[#F7F2E9] font-medium mt-0.5">
                          {storeSettings.address}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-[#B69358] shrink-0 mt-1" />
                      <div>
                        <div className="text-xs text-[#F7F2E9]/55">영업시간 · 휴무일</div>
                        <div className="text-[#F7F2E9] font-medium mt-0.5 font-mono tabular-nums">
                          {storeSettings.openHoursText}
                        </div>
                        <div className="text-xs text-[#B69358] mt-1">
                          {storeSettings.regularClosedDay}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Phone className="w-4 h-4 text-[#B69358] shrink-0 mt-1" />
                      <div>
                        <div className="text-xs text-[#F7F2E9]/55">예약 및 대관 문의 전화</div>
                        <a
                          href={`tel:${storeSettings.phone}`}
                          className="inline-block text-[#F7F2E9] hover:text-[#B69358] font-mono font-semibold tabular-nums mt-0.5 underline underline-offset-4 transition-colors"
                        >
                          {storeSettings.phone}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stylized Architectural Map Card */}
                <div className="lg:col-span-6 bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 flex flex-col justify-between min-h-[320px]">
                  <div className="relative flex-1 rounded-lg bg-[#181513] border border-[#F7F2E9]/10 overflow-hidden flex items-center justify-center p-6">
                    <svg
                      className="w-full h-full max-h-60 opacity-85"
                      viewBox="0 0 500 260"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Roads */}
                      <line x1="0" y1="80" x2="500" y2="80" stroke="#302B27" strokeWidth="18" />
                      <line x1="0" y1="190" x2="500" y2="190" stroke="#302B27" strokeWidth="26" />
                      <line x1="160" y1="0" x2="160" y2="260" stroke="#302B27" strokeWidth="16" />
                      <line x1="350" y1="0" x2="350" y2="260" stroke="#302B27" strokeWidth="22" />
                      {/* Landmark Block */}
                      <rect
                        x="30"
                        y="100"
                        width="110"
                        height="70"
                        rx="8"
                        fill="#222920"
                        stroke="#B69358"
                        strokeOpacity="0.35"
                      />
                      <text x="85" y="140" fill="#B69358" fontSize="11" textAnchor="middle">
                        송파동 · 가락로
                      </text>
                      {/* Road labels */}
                      <text x="430" y="185" fill="#F7F2E9" fillOpacity="0.45" fontSize="10">
                        가락로
                      </text>
                      <text x="172" y="40" fill="#F7F2E9" fillOpacity="0.45" fontSize="10">
                        가락로28길
                      </text>
                      {/* Haochan Pin */}
                      <circle cx="255" cy="128" r="24" fill="#A52A32" fillOpacity="0.25" />
                      <circle cx="255" cy="128" r="10" fill="#A52A32" stroke="#F7F2E9" strokeWidth="2" />
                      <rect
                        x="185"
                        y="82"
                        width="140"
                        height="28"
                        rx="6"
                        fill="#1E1B19"
                        stroke="#B69358"
                        strokeWidth="1.2"
                      />
                      <text
                        x="255"
                        y="100"
                        fill="#F7F2E9"
                        fontSize="12"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        하오찬 (서울빌딩 1층)
                      </text>
                    </svg>
                  </div>

                  <div className="pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#F7F2E9]/70">
                    <span>위치: 서울 송파구 가락로28길 11 서울빌딩 1층</span>
                    <span className="font-mono text-[#B69358] tabular-nums">
                      예약 및 문의: {storeSettings.phone}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================
            VIEW 2: FULL MENU (전체 메뉴)
           ========================================================= */}
        {activeView === 'menu' && (
          <section className="max-w-7xl mx-auto px-6 py-12 space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#F7F2E9]/10">
              <div className="space-y-2">
                <div className="text-xs text-[#B69358] tracking-widest">
                  하오찬 전체 메뉴 · 미식 가이드
                </div>
                <h1 className="font-serif-kr text-3xl sm:text-4xl font-bold text-[#F7F2E9]">
                  오늘, 어떤 맛을 만나고 싶으신가요?
                </h1>
                <p className="text-sm text-[#F7F2E9]/70 max-w-2xl">
                  모든 요리는 방문 시간에 맞추어 즉석 조리됩니다. 한정 수량 메뉴(동파육, 만찬 코스)는 예약 시 사전 선택해 두시면 더욱 여유롭게 즐기실 수 있습니다.
                </p>
              </div>

              {/* Interactive Category Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#272320] border border-[#F7F2E9]/10 rounded-lg">
                {(
                  [
                    { id: 'all', label: '전체 메뉴' },
                    { id: 'signature', label: '시그니처 요리' },
                    { id: 'course', label: '프리미엄 코스' },
                    { id: 'meal', label: '식사 · 면류' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setMenuCategory(cat.id)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      menuCategory === cat.id
                        ? 'bg-[#A52A32] text-[#F7F2E9]'
                        : 'text-[#F7F2E9]/70 hover:text-[#F7F2E9]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {displayedMenus.map((item) => (
                <div
                  key={item.id}
                  className="group bg-[#272320] border border-[#F7F2E9]/10 rounded-xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div
                      onClick={() => setSelectedMenuModal(item)}
                      className="aspect-[4/3] w-full cursor-pointer overflow-hidden"
                    >
                      <VisualAsset
                        src={item.imageUrl}
                        alt={item.name}
                        variant={item.artworkVariant}
                        className="w-full h-full"
                      />
                    </div>

                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-2 text-xs text-[#B69358]">
                        <span>{item.categoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.servingInfo}</span>
                      </div>

                      <div className="flex items-baseline justify-between gap-3">
                        <h2
                          onClick={() => setSelectedMenuModal(item)}
                          className="font-serif-kr text-xl font-semibold text-[#F7F2E9] group-hover:text-[#B69358] transition-colors cursor-pointer"
                        >
                          {item.name}
                        </h2>
                        <span className="font-mono text-base font-semibold text-[#F7F2E9] tabular-nums shrink-0">
                          {item.price.toLocaleString()}원
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-[#F7F2E9]/75 leading-relaxed">
                        {item.description}
                      </p>

                      <div className="pt-2 text-xs text-[#F7F2E9]/55">
                        주요 식재료: {item.ingredients}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 pb-6 pt-3 border-t border-[#F7F2E9]/10 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMenuModal(item)}
                      className="text-xs text-[#B69358] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      셰프 노트 · 상세 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => jumpToReservationWithPreset({ menuName: item.name })}
                      className="px-4 py-2 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      이 메뉴 포함 예약하기
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =========================================================
            VIEW 3: CUSTOMER TABLE RESERVATION (하오찬 테이블 예약 - Proposal Section 5)
           ========================================================= */}
        {activeView === 'reservation' && (
          <section className="max-w-5xl mx-auto px-6 py-12 space-y-10">
            <div className="space-y-2 pb-6 border-b border-[#F7F2E9]/10">
              <div className="text-xs text-[#B69358] tracking-widest">
                하오찬 온라인 예약 시스템 · 실시간 잔여석 연동
              </div>
              <h1 className="font-serif-kr text-3xl sm:text-4xl font-bold text-[#F7F2E9]">
                하오찬 테이블 예약
              </h1>
              <p className="text-sm text-[#F7F2E9]/70">
                소중한 식사 시간을 미리 준비하세요. 날짜와 인원, 시간을 선택하시면 잔여 좌석을 확인하고 바로 예약하실 수 있습니다.
              </p>
            </div>

            {bookingFeedback && (
              <div
                className={`p-6 rounded-xl border ${
                  bookingFeedback.type === 'success'
                    ? 'bg-[#272320] border-[#B69358]'
                    : 'bg-[#272320] border-rose-500/60'
                } space-y-4`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {bookingFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-[#B69358] shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <h3 className="font-serif-kr text-base font-semibold text-[#F7F2E9]">
                        {bookingFeedback.type === 'success'
                          ? '예약 신청이 완료되었습니다'
                          : '예약 입력 정보를 확인해 주세요'}
                      </h3>
                      <p className="text-xs sm:text-sm text-[#F7F2E9]/80">
                        {bookingFeedback.message}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBookingFeedback(null)}
                    className="text-[#F7F2E9]/50 hover:text-[#F7F2E9] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {bookingFeedback.reservation && (
                  <div className="bg-[#1E1B19] border border-[#F7F2E9]/10 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 text-xs sm:text-sm">
                      <div className="font-mono text-[#B69358] tabular-nums">
                        {bookingFeedback.reservation.date} · {bookingFeedback.reservation.time} ·{' '}
                        {bookingFeedback.reservation.partySize}명 (
                        {TABLE_LABELS[bookingFeedback.reservation.tableType]})
                      </div>
                      <div className="text-[#F7F2E9]/80">
                        예약자: {bookingFeedback.reservation.customerName} (
                        {bookingFeedback.reservation.customerPhone})
                        {bookingFeedback.reservation.preselectedMenu
                          ? ` · 사전 메뉴: ${bookingFeedback.reservation.preselectedMenu}`
                          : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveView('lookup')}
                        className="px-4 py-2 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        내 예약 조회하기
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView('admin')}
                        className="px-3.5 py-2 bg-[#272320] hover:bg-[#322C28] border border-[#F7F2E9]/15 text-[#F7F2E9] text-xs font-medium rounded-lg cursor-pointer"
                      >
                        관리자 화면에서 확인
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={handleReservationSubmit}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left 7 Columns: Date, Party Size, Time Slot Selection */}
              <div className="lg:col-span-7 bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 sm:p-8 space-y-8">
                {/* Step 1: Visit Date */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#F7F2E9] flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#B69358]" />
                      <span>1. 방문 날짜</span>
                    </label>
                    <span className="font-mono text-xs text-[#B69358] tabular-nums">
                      선택일: {visitDate}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="px-4 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/20 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9] focus:outline-none focus:border-[#B69358]"
                    />
                    {[
                      { label: '기획안 예시일 (26. 11. 05.)', value: '2026-11-05' },
                      { label: '주말 런치/디너 (26. 11. 07.)', value: '2026-11-07' },
                      { label: '다음 주 (26. 11. 12.)', value: '2026-11-12' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setVisitDate(preset.value)}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          visitDate === preset.value
                            ? 'bg-[#A52A32]/25 border-[#A52A32] text-[#F7F2E9]'
                            : 'bg-[#1E1B19] border-[#F7F2E9]/10 text-[#F7F2E9]/70 hover:text-[#F7F2E9]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {isSelectedDateClosed && (
                    <p className="text-xs text-rose-400">
                      선택하신 날짜({visitDate})는 매장 지정 휴무일입니다. 다른 날짜를 선택해 주세요.
                    </p>
                  )}
                </div>

                {/* Step 2: Party Size */}
                <div className="space-y-3 pt-4 border-t border-[#F7F2E9]/10">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#F7F2E9] flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#B69358]" />
                      <span>2. 예약 인원</span>
                    </label>
                    <span className="text-xs text-[#F7F2E9]/60">
                      온라인 최대 {storeSettings.maxPartySize}명 (단체는 전화 문의)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                    {Array.from(
                      { length: storeSettings.maxPartySize },
                      (_, idx) => idx + 1
                    ).map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPartySize(num)}
                        className={`py-2.5 px-3 rounded-lg text-sm font-mono tabular-nums font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          partySize === num
                            ? 'bg-[#A52A32] border-[#A52A32] text-[#F7F2E9]'
                            : 'bg-[#1E1B19] border-[#F7F2E9]/15 text-[#F7F2E9]/80 hover:border-[#B69358]/50'
                        }`}
                      >
                        {num}명
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Time Slot Selection */}
                <div className="space-y-3 pt-4 border-t border-[#F7F2E9]/10">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#F7F2E9] flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#B69358]" />
                      <span>3. 예약 시간</span>
                    </label>
                    <span className="text-xs text-[#F7F2E9]/60">
                      실제 운영시간과 남은 좌석에 따라 선택 가능 여부를 표시합니다.
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-2.5">
                    {storeSettings.availableSlots.map((slot) => {
                      const isBlocked =
                        isSelectedDateClosed ||
                        storeSettings.blockedSlotKeys.includes(`${visitDate}_${slot}`);
                      const remaining =
                        slotRemainingSeatsMap[slot] ?? storeSettings.maxSeatsPerSlot;
                      const isEnoughSeats = remaining >= partySize;
                      const isDisabled = isBlocked || !isEnoughSeats;

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setVisitTime(slot)}
                          className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                            isDisabled
                              ? 'bg-[#181513] border-[#F7F2E9]/5 text-[#F7F2E9]/30 cursor-not-allowed'
                              : visitTime === slot
                              ? 'bg-[#A52A32] border-[#A52A32] text-[#F7F2E9]'
                              : 'bg-[#1E1B19] border-[#F7F2E9]/15 text-[#F7F2E9] hover:border-[#B69358]/60'
                          }`}
                        >
                          <div className="font-mono text-sm font-semibold tabular-nums">
                            {slot}
                          </div>
                          <div
                            className={`text-[11px] font-mono tabular-nums mt-0.5 ${
                              isDisabled
                                ? 'text-rose-400/60'
                                : visitTime === slot
                                ? 'text-[#F7F2E9]/90'
                                : 'text-[#B69358]'
                            }`}
                          >
                            {isBlocked
                              ? '예약 마감'
                              : !isEnoughSeats
                              ? `잔여 ${remaining}석`
                              : `잔여 ${remaining}석 가능`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 4: Preferred Seating & Optional Dish */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#F7F2E9]/10">
                  <div>
                    <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                      선호 좌석 구역 선택
                    </label>
                    <select
                      value={tableType}
                      onChange={(e) => setTableType(e.target.value as TableType)}
                      className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                    >
                      <option value="hall">메인 다이닝 홀 (2~4인)</option>
                      <option value="window">테라스 뷰 창가석 (2~4인)</option>
                      <option value="private_room">프라이빗 단독 룸 (4~12인 권장)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#F7F2E9]/70 mb-1.5">
                      사전 대표 메뉴 선택 (선택사항)
                    </label>
                    <select
                      value={preselectedMenu}
                      onChange={(e) => setPreselectedMenu(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9]"
                    >
                      <option value="">현장에서 메뉴 선택</option>
                      {HAOCHAN_MENUS.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name} ({m.price.toLocaleString()}원)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Customer Info & Confirmation Box */}
              <div className="lg:col-span-5 bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 sm:p-8 space-y-6">
                <div className="space-y-1">
                  <h2 className="font-serif-kr text-xl font-semibold text-[#F7F2E9]">
                    예약자 정보 입력
                  </h2>
                  <p className="text-xs text-[#F7F2E9]/65">
                    예약 확정 안내 및 방문 전 알림을 받을 연락처를 입력해 주세요.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#F7F2E9]/75 mb-1.5">
                      예약자 성함 *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={VALIDATION_RULES.NAME_MAX_LENGTH}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="예: 김민수"
                      className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9] placeholder:text-[#F7F2E9]/35 focus:outline-none focus:border-[#B69358]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#F7F2E9]/75 mb-1.5">
                      연락처 *
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={VALIDATION_RULES.PHONE_MAX_LENGTH}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="예: 010-1234-5678"
                      className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm font-mono tabular-nums text-[#F7F2E9] placeholder:text-[#F7F2E9]/35 focus:outline-none focus:border-[#B69358]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#F7F2E9]/75 mb-1.5">
                      요청사항 (선택)
                    </label>
                    <textarea
                      rows={3}
                      maxLength={VALIDATION_RULES.NOTES_MAX_LENGTH}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="유아용 의자 필요, 알레르기 식품, 창가석 희망 등"
                      className="w-full px-3.5 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 rounded-lg text-sm text-[#F7F2E9] placeholder:text-[#F7F2E9]/35 focus:outline-none focus:border-[#B69358]"
                    />
                  </div>
                </div>

                {/* Selected Reservation Summary Box (Proposal Section 5) */}
                <div className="bg-[#1E1B19] border border-[#B69358]/45 rounded-xl p-5 space-y-2">
                  <div className="text-xs text-[#B69358]">선택하신 예약 정보</div>
                  <div className="font-mono text-lg font-bold text-[#F7F2E9] tabular-nums">
                    {visitDate} · {visitTime} · {partySize}명
                  </div>
                  <div className="text-xs text-[#F7F2E9]/75">
                    좌석: {TABLE_LABELS[tableType]}
                    {preselectedMenu ? ` · 메뉴: ${preselectedMenu}` : ''}
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={submittingBooking || isSelectedDateClosed}
                    className="w-full py-3.5 px-5 bg-[#A52A32] hover:bg-[#8E2229] disabled:opacity-50 text-[#F7F2E9] text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {submittingBooking
                      ? '예약 접수 처리 중...'
                      : currentUser
                      ? '하오찬 테이블 예약 신청하기'
                      : '예약 신청하기 (비회원 시뮬레이션 / 회원 DB 연동)'}
                  </button>

                  {!currentUser && (
                    <button
                      type="button"
                      onClick={() => setAuthModalOpen(true)}
                      className="w-full py-2.5 px-4 bg-[#1E1B19] hover:bg-[#322C28] border border-[#F7F2E9]/15 text-[#B69358] text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      구글 간편 로그인으로 내 예약 영구 저장하기
                    </button>
                  )}
                </div>
              </div>
            </form>
          </section>
        )}

        {/* =========================================================
            VIEW 4: CUSTOMER RESERVATION LOOKUP (예약 조회 · 취소)
           ========================================================= */}
        {activeView === 'lookup' && (
          <section className="max-w-5xl mx-auto px-6 py-12 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-[#F7F2E9]/10">
              <div className="space-y-2">
                <div className="text-xs text-[#B69358] tracking-widest">
                  고객 예약 내역 확인 및 취소
                </div>
                <h1 className="font-serif-kr text-3xl sm:text-4xl font-bold text-[#F7F2E9]">
                  내 예약 조회
                </h1>
                <p className="text-sm text-[#F7F2E9]/70">
                  신청하신 예약의 날짜, 시간, 인원, 진행 상태(대기·확정·취소)를 확인하고 관리하실 수 있습니다.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={lookupPhoneFilter}
                  onChange={(e) => setLookupPhoneFilter(e.target.value)}
                  placeholder="연락처 뒷자리 검색 (예: 1920)"
                  className="px-3.5 py-2 bg-[#272320] border border-[#F7F2E9]/15 rounded-lg text-xs font-mono text-[#F7F2E9] placeholder:text-[#F7F2E9]/40 focus:outline-none focus:border-[#B69358]"
                />
                <button
                  type="button"
                  onClick={() => setActiveView('reservation')}
                  className="px-4 py-2 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  새 예약 추가
                </button>
              </div>
            </div>

            {myReservations.length === 0 ? (
              <div className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-12 text-center space-y-4">
                <p className="text-base text-[#F7F2E9]/80">
                  조회된 예약 내역이 없습니다.
                </p>
                <p className="text-xs text-[#F7F2E9]/55">
                  새로운 테이블 예약을 신청하시거나 연락처 검색어를 지워 주세요.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView('reservation')}
                  className="px-5 py-2.5 bg-[#A52A32] text-[#F7F2E9] text-xs font-semibold rounded-lg cursor-pointer"
                >
                  하오찬 예약하러 가기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {myReservations.map((res) => {
                  const canCancel =
                    res.status === 'pending' || res.status === 'confirmed';

                  return (
                    <div
                      key={res.id}
                      className="bg-[#272320] border border-[#F7F2E9]/10 rounded-xl p-6 flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-[#B69358] tabular-nums">
                            {res.date} · {res.time}
                          </span>
                          <span
                            className={`font-semibold ${
                              res.status === 'confirmed'
                                ? 'text-emerald-400'
                                : res.status === 'pending'
                                ? 'text-[#B69358]'
                                : 'text-rose-400'
                            }`}
                          >
                            {STATUS_LABELS[res.status]}
                          </span>
                        </div>

                        <h3 className="font-serif-kr text-xl font-semibold text-[#F7F2E9]">
                          {res.customerName}님 · {res.partySize}명 ({TABLE_LABELS[res.tableType]})
                        </h3>

                        <div className="text-xs text-[#F7F2E9]/70 space-y-1">
                          <div>연락처: {res.customerPhone}</div>
                          <div>
                            사전 선택 메뉴: {res.preselectedMenu || '현장 주문'}
                          </div>
                          {res.notes && <div>요청사항: “{res.notes}”</div>}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[#F7F2E9]/10 flex items-center justify-between">
                        <span className="text-xs text-[#F7F2E9]/45">
                          매장 문의: {storeSettings.phone}
                        </span>
                        {canCancel ? (
                          <button
                            type="button"
                            onClick={() => handleCustomerCancel(res)}
                            className="px-3.5 py-1.5 bg-[#1E1B19] hover:bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            예약 취소 신청
                          </button>
                        ) : (
                          <span className="text-xs text-[#F7F2E9]/40">
                            상태 변경 마감
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =========================================================
            VIEW 5: ADMIN DASHBOARD (하오찬 예약 관리 - Proposal Section 7)
           ========================================================= */}
        {activeView === 'admin' && (
          <AdminDashboard
            isAdmin={isAdmin}
            userEmail={currentUser?.email || null}
            reservations={combinedAdminReservations}
            storeSettings={storeSettings}
            onUpdateReservationStatus={handleAdminUpdateReservation}
            onDeleteReservation={handleAdminDeleteReservation}
            onSeedSampleReservations={handleSeedSampleReservations}
            onSaveStoreSettings={handleSaveStoreSettings}
            onRequestLogin={() => setAuthModalOpen(true)}
          />
        )}
      </main>

      {/* RESERVATION CONFIRMED MODAL */}
      {confirmedModalReservation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#272320] border border-[#B69358] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-[#B69358] shrink-0" />
                <h3 className="font-serif-kr text-2xl font-bold text-[#F7F2E9]">
                  예약 신청이 접수되었습니다
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmedModalReservation(null)}
                className="text-[#F7F2E9]/60 hover:text-[#F7F2E9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#1E1B19] border border-[#F7F2E9]/10 rounded-xl p-5 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-[#F7F2E9]/10 pb-2.5">
                <span className="text-xs text-[#F7F2E9]/60">방문 일시</span>
                <span className="font-mono font-bold text-[#B69358] tabular-nums">
                  {confirmedModalReservation.date} · {confirmedModalReservation.time}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#F7F2E9]/10 pb-2.5">
                <span className="text-xs text-[#F7F2E9]/60">예약자 · 연락처</span>
                <span className="font-medium text-[#F7F2E9]">
                  {confirmedModalReservation.customerName} ({confirmedModalReservation.customerPhone})
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#F7F2E9]/10 pb-2.5">
                <span className="text-xs text-[#F7F2E9]/60">인원 · 좌석</span>
                <span className="font-medium text-[#F7F2E9]">
                  {confirmedModalReservation.partySize}명 ·{' '}
                  {TABLE_LABELS[confirmedModalReservation.tableType]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#F7F2E9]/60">사전 선택 메뉴</span>
                <span className="text-xs text-[#F7F2E9]/85">
                  {confirmedModalReservation.preselectedMenu || '현장 주문'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmedModalReservation(null);
                  setActiveView('lookup');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex-1 py-3 px-4 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                내 예약 조회 화면으로 이동
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmedModalReservation(null);
                  setActiveView('admin');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex-1 py-3 px-4 bg-[#1E1B19] hover:bg-[#322C28] border border-[#F7F2E9]/15 text-[#B69358] text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                관리자 화면에서 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MENU DETAIL MODAL */}
      {selectedMenuModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[#272320] border border-[#F7F2E9]/15 rounded-2xl overflow-hidden shadow-2xl">
            <div className="aspect-[16/10] w-full relative">
              <VisualAsset
                src={selectedMenuModal.imageUrl}
                alt={selectedMenuModal.name}
                variant={selectedMenuModal.artworkVariant}
                className="w-full h-full"
              />
              <button
                type="button"
                onClick={() => setSelectedMenuModal(null)}
                className="absolute top-4 right-4 z-20 p-2 bg-[#1E1B19]/85 text-[#F7F2E9] rounded-full hover:bg-[#A52A32] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-5">
              <div className="space-y-1">
                <div className="text-xs text-[#B69358]">
                  {selectedMenuModal.categoryLabel} · {selectedMenuModal.servingInfo}
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-serif-kr text-2xl font-bold text-[#F7F2E9]">
                    {selectedMenuModal.name}
                  </h3>
                  <span className="font-mono text-xl font-bold text-[#B69358] tabular-nums">
                    {selectedMenuModal.price.toLocaleString()}원
                  </span>
                </div>
              </div>

              <p className="text-sm text-[#F7F2E9]/85 leading-relaxed">
                {selectedMenuModal.description}
              </p>

              <div className="bg-[#1E1B19] border border-[#F7F2E9]/10 rounded-xl p-4 space-y-2 text-xs">
                <div>
                  <span className="text-[#B69358] font-medium">주요 식재료: </span>
                  <span className="text-[#F7F2E9]/80">{selectedMenuModal.ingredients}</span>
                </div>
                <div>
                  <span className="text-[#B69358] font-medium">셰프 추천 노트: </span>
                  <span className="text-[#F7F2E9]/80">{selectedMenuModal.chefNote}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedMenuModal(null)}
                  className="px-4 py-2.5 bg-[#1E1B19] text-[#F7F2E9]/80 text-xs font-medium rounded-lg cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() =>
                    jumpToReservationWithPreset({ menuName: selectedMenuModal.name })
                  }
                  className="px-5 py-2.5 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-xs font-semibold rounded-lg cursor-pointer"
                >
                  이 메뉴 선택하여 테이블 예약하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOGIN / ACCOUNT MODAL */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#272320] border border-[#F7F2E9]/15 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-serif-kr text-2xl font-bold text-[#F7F2E9]">
                {currentUser ? '하오찬 회원 계정 정보' : '하오찬 로그인 · 회원가입'}
              </h3>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="text-[#F7F2E9]/60 hover:text-[#F7F2E9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {currentUser ? (
              <div className="space-y-5">
                <div className="bg-[#1E1B19] border border-[#F7F2E9]/10 rounded-xl p-4 space-y-1.5 text-sm">
                  <div className="font-semibold text-[#F7F2E9]">
                    {currentUser.displayName || '하오찬 회원'}
                  </div>
                  <div className="text-xs text-[#F7F2E9]/70 font-mono">
                    {currentUser.email}
                  </div>
                  <div className="text-xs text-[#B69358] pt-1">
                    {isAdmin
                      ? '권한: 하오찬 매장 총괄 관리자'
                      : '권한: 하오찬 정회원 (실시간 예약 조회·취소 가능)'}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalOpen(false);
                      setActiveView('lookup');
                    }}
                    className="flex-1 py-2.5 bg-[#A52A32] text-[#F7F2E9] text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    내 예약 내역 보기
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#1E1B19] border border-[#F7F2E9]/15 text-[#F7F2E9]/80 text-xs font-medium rounded-lg cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>로그아웃</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-xs sm:text-sm text-[#F7F2E9]/75 leading-relaxed">
                  로그인하시면 방문 날짜·시간·인원 예약 내역을 언제든 조회하거나 취소하실 수 있으며, 관리자 계정({ADMIN_EMAIL})으로 로그인 시 실시간 매장 설정이 활성화됩니다.
                </p>

                {authError && (
                  <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-lg text-xs text-rose-200">
                    {authError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full py-3 px-4 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Google 계정으로 간편 로그인 / 회원가입</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLEAN EDITORIAL FOOTER (No telemetry tickers or fake system logs) */}
      <footer className="border-t border-[#F7F2E9]/10 bg-[#181513] py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-[#F7F2E9]/55">
          <div className="space-y-1.5">
            <div className="font-serif-kr text-lg font-bold text-[#F7F2E9]">하오찬</div>
            <p>
              {storeSettings.address} · 대표전화 {storeSettings.phone}
            </p>
            <p>영업시간: {storeSettings.openHoursText}</p>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="hover:text-[#F7F2E9] cursor-pointer"
            >
              하오찬 소개
            </button>
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className="hover:text-[#F7F2E9] cursor-pointer"
            >
              전체 메뉴
            </button>
            <button
              type="button"
              onClick={() => setActiveView('reservation')}
              className="hover:text-[#F7F2E9] cursor-pointer"
            >
              테이블 예약
            </button>
            <button
              type="button"
              onClick={() => setActiveView('lookup')}
              className="hover:text-[#F7F2E9] cursor-pointer"
            >
              예약 조회
            </button>
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className="text-[#B69358] hover:underline cursor-pointer"
            >
              관리자 예약 관리
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
