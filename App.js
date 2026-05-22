import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
  Animated,
  Easing,
  StyleSheet,
  StatusBar,
  Modal,
  Alert,
  useWindowDimensions,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_400Regular_Italic,
} from '@expo-google-fonts/newsreader';
import {
  Brain,
  TrendingUp,
  Check,
  Flame,
  RefreshCw,
  ExternalLink,
  BookOpen,
  HelpCircle,
  Sparkles,
  FileText,
  ChevronDown,
  RotateCcw,
  Settings as SettingsIcon,
  X,
  Globe,
  MessageCircle,
  Send,
  Baby,
} from 'lucide-react-native';

const C = {
  paper: '#f3ede1',
  paperDark: '#e9e0cf',
  ink: '#1c1a17',
  inkSoft: '#5a544a',
  rust: '#b1432a',
  rustDark: '#8f3320',
  line: '#d6cab2',
  ai: '#2f5d50',
  mkt: '#9c5a17',
};

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) =>
  new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const pdfUrl = (u = '') => (u.includes('arxiv.org/abs/') ? u.replace('/abs/', '/pdf/') : u);

// Best in-app render URL for the paper:
// - arxiv.org/abs/X → arxiv.org/html/X  (mobile HTML, MathJax math)
// - arxiv.org/pdf/X → keep, WKWebView renders PDFs natively
// - everything else → keep as is
const viewUrl = (u = '') => {
  if (u.includes('arxiv.org/abs/')) return u.replace('/abs/', '/html/');
  return u;
};

const store = {
  async get(k) {
    try {
      const v = await AsyncStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  async set(k, v) {
    try {
      await AsyncStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function providerForKey(k = '') {
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  return null;
}

async function callGeminiOnce(prompt, apiKey, raw) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }),
  });
  if (res.status === 429) {
    const err = new Error('rate_limited');
    err.code = 429;
    err.retryAfter = 20;
    throw err;
  }
  if (res.status === 503) {
    const err = new Error('overloaded');
    err.code = 529;
    err.retryAfter = 10;
    throw err;
  }
  if (!res.ok) throw new Error('http ' + res.status);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'api');
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('\n').trim();
  if (raw) return text;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('no json');
  return JSON.parse(text.slice(s, e + 1));
}

async function callClaudeOnce(prompt, apiKey, raw) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });
  if (res.status === 429) {
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    const err = new Error('rate_limited');
    err.code = 429;
    err.retryAfter = Number.isFinite(ra) && ra > 0 ? ra : 20;
    throw err;
  }
  if (res.status === 529) {
    const err = new Error('overloaded');
    err.code = 529;
    err.retryAfter = 10;
    throw err;
  }
  if (!res.ok) throw new Error('http ' + res.status);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'api');
  const text = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (raw) return text;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('no json');
  return JSON.parse(text.slice(s, e + 1));
}

async function callClaude(prompt, apiKey, raw = false, onWait) {
  const provider = providerForKey(apiKey);
  const once = provider === 'gemini' ? callGeminiOnce : callClaudeOnce;
  let attempt = 0;
  while (true) {
    try {
      return await once(prompt, apiKey, raw);
    } catch (e) {
      const transient = e.code === 429 || e.code === 529;
      if (!transient || attempt >= 1) throw e;
      const wait = Math.min(60, e.retryAfter || 20);
      if (onWait) onWait(wait);
      await sleep(wait * 1000);
      attempt++;
    }
  }
}

function friendlyError(e) {
  if (e && e.code === 429) {
    return `Rate limited — your key hit its per-minute cap. Try again in about ${e.retryAfter || 20}s.`;
  }
  if (e && e.code === 529) return 'The API is overloaded right now. Try again in a moment.';
  if (e && /401|403|400/.test(e.message || '')) return 'API key was rejected. Open settings and re-paste it.';
  return "Couldn't fetch a paper right now. Tap to try again.";
}

function parseRead(text) {
  const complete = /\[END\]/i.test(text);
  text = text.replace(/\[END\]/gi, '').trim();
  const secs = [];
  let cur = null;
  for (const ln of text.split(/\n/)) {
    const h = ln.match(/^\s*#{1,4}\s+(.+)/) || ln.match(/^\s*\*\*(.+?)\*\*\s*:?\s*$/);
    if (h) {
      if (cur) secs.push(cur);
      cur = { heading: h[1].trim().replace(/[:*]+$/, ''), body: '' };
    } else if (ln.trim()) {
      if (!cur) cur = { heading: '', body: '' };
      cur.body += (cur.body ? ' ' : '') + ln.trim();
    }
  }
  if (cur) secs.push(cur);
  return { sections: secs.filter((s) => s.body || s.heading), complete };
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_900Black,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
  });

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Phone classes
  const isCompact = width < 360;   // iPhone SE 1st gen, mini-ish
  const isSmall   = width < 380;   // iPhone SE 3rd gen, 13 mini
  const isLarge   = width >= 414;  // Plus / Pro Max
  const isXLarge  = width >= 768;  // iPad if ever supported

  // Visible scale based on width — wider range so each device feels right
  const rawScale = width / 390;          // iPhone 17 Pro baseline
  const scale = Math.max(0.82, Math.min(1.30, rawScale));
  const s = (n) => n * scale;

  // Proportional horizontal padding: ~5.5% of width, clamped
  const pad = Math.max(16, Math.min(40, Math.round(width * 0.055)));

  // Readable content max-width — keeps long-form readable on big screens
  const contentMax = Math.min(width, 640);

  // Bottom inset for ScrollView + Modal so home-indicator never overlaps
  const safeBottom = Math.max(insets.bottom, 12);

  const styles = React.useMemo(
    () => makeStyles(s, pad, isCompact, isSmall, isLarge),
    [scale, pad, isCompact, isSmall, isLarge]
  );

  const [topic, setTopic] = useState('ai');
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ streak: 0, lastStudied: null, history: [] });
  const [studiedToday, setStudiedToday] = useState(false);

  const [reading, setReading] = useState(false);
  const [sections, setSections] = useState([]);
  const [complete, setComplete] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [readWait, setReadWait] = useState(null);

  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [viewing, setViewing] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef(null);

  const spin = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const readSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const saved = await store.get('study-data');
      if (saved) {
        setData(saved);
        setStudiedToday(saved.lastStudied === today());
      }
      const key = await AsyncStorage.getItem('anthropic-key');
      if (key) setApiKey(key);
    })();
  }, []);

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spin.stopAnimation();
      spin.setValue(0);
    }
  }, [loading]);

  useEffect(() => {
    if (readLoading) {
      Animated.loop(
        Animated.timing(readSpin, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      readSpin.stopAnimation();
      readSpin.setValue(0);
    }
  }, [readLoading]);

  useEffect(() => {
    if (paper) {
      rise.setValue(0);
      Animated.timing(rise, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [paper]);

  function resetReader() {
    setReading(false);
    setSections([]);
    setComplete(false);
    setReadError(false);
    setReadWait(null);
    setMessages([]);
    setChatInput('');
  }

  async function askChat(rawQuestion) {
    const question = (rawQuestion || '').trim();
    if (!question || chatLoading || !paper) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMsg = { role: 'user', text: question };
    const history = [...messages, userMsg];
    setMessages(history);
    setChatInput('');
    setChatLoading(true);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);

    const covered = sections.length
      ? `\n\nWhat the user has read so far (in plain English):\n${sections
          .map((s) => `• ${s.heading || ''}: ${s.body}`)
          .join('\n')}`
      : '';

    const convo = history
      .map((m) => `${m.role === 'user' ? 'User' : 'You'}: ${m.text}`)
      .join('\n\n');

    const prompt = `You are an ELI5 tutor — explain everything like the user is 5 years old. Use everyday words, short sentences, and real-world analogies (pizza, bikes, LEGO, animals). Never use jargon without defining it in plain English first. Be warm, encouraging, and concrete.

Paper being studied: "${paper.title}" by ${paper.authors}
Link: ${paper.url}
Topic area: ${topic === 'ai' ? 'AI / machine learning' : 'financial markets / investing'}${covered}

Conversation so far:
${convo}

Reply to the user's most recent message in plain text (no markdown headings, no asterisks). 1–3 short paragraphs MAX. If the user's question is about something you don't actually know from the paper, say "I'd need to peek at the paper for that — but here's what I can tell you..." and offer your best general explanation.`;

    try {
      const reply = await callClaude(prompt, apiKey, true);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: friendlyError(e) },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  async function fetchPaper() {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    setLoading(true);
    setError(null);
    setPaper(null);
    resetReader();

    const subject =
      topic === 'ai'
        ? 'artificial intelligence / machine learning / large language models'
        : 'financial markets, investing, or quantitative finance';

    const prompt = `Use web search to find ONE real, recent (2025-2026), freely accessible research paper on ${subject} (arXiv, SSRN, NBER, or a reputable lab blog), suitable for a motivated beginner.
Return ONLY JSON (no markdown, no preamble):
{"title":string,"authors":string,"source":string,"url":string,"difficulty":"Beginner"|"Intermediate"|"Advanced","problem":string,"keyIdea":string,"whyItMatters":string,"studyQuestion":string}`;

    try {
      setPaper(
        await callClaude(prompt, apiKey, false, (s) =>
          setError(`Rate limited — retrying in ${s}s…`)
        )
      );
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!paper || readLoading) return;
    setReadLoading(true);
    setReadError(false);
    const covered = sections.map((s) => s.heading).filter(Boolean).join('; ') || 'none yet';
    const prompt = `You are giving a learner a FULL, detailed, in-app read of this research paper — NOT a short summary. Be thorough and faithful to the paper's real content, in plain English, defining any jargon.
Paper: "${paper.title}" by ${paper.authors}. Link: ${paper.url}.
Sections already covered: ${covered}.
Use web search to read the paper, then CONTINUE from where the covered sections left off, walking through it in order: background, the problem, the method/approach, the key results and what they mean, why it matters, and limitations or open questions.
Format as plain text. Begin each new section with a line like "## Heading". Write several full sentences per section.
When (and only when) you have thoroughly covered the ENTIRE paper, end your reply with [END] on its own line.`;
    try {
      const text = await callClaude(prompt, apiKey, true, (s) => setReadWait(s));
      const { sections: secs, complete: done } = parseRead(text);
      if (!secs.length) throw new Error('empty');
      setSections((prev) => [...prev, ...secs]);
      setComplete(done);
    } catch {
      setReadError(true);
    } finally {
      setReadLoading(false);
      setReadWait(null);
    }
  }

  function toggleReader() {
    const next = !reading;
    setReading(next);
    if (next && sections.length === 0 && !readLoading) loadMore();
  }

  async function markStudied() {
    if (studiedToday || !paper) return;
    const t = today();
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let streak = 1;
    if (data.lastStudied === y) streak = data.streak + 1;
    else if (data.lastStudied === t) streak = data.streak;
    const next = {
      streak,
      lastStudied: t,
      history: [{ title: paper.title, topic, date: t }, ...data.history].slice(0, 30),
    };
    setData(next);
    setStudiedToday(true);
    await store.set('study-data', next);
  }

  async function saveKey() {
    const k = tempKey.trim();
    const p = providerForKey(k);
    if (!p) {
      Alert.alert(
        'Invalid key',
        'Anthropic keys start with "sk-ant-". Gemini keys start with "AIza".'
      );
      return;
    }
    await AsyncStorage.setItem('anthropic-key', k);
    setApiKey(k);
    setTempKey('');
    setShowSettings(false);
  }

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.ink} />
      </View>
    );
  }

  const accent = topic === 'ai' ? C.ai : C.mkt;
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const readSpinDeg = readSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const riseTranslate = rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={C.paper} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{
            paddingBottom: safeBottom + 32,
            alignSelf: 'center',
            width: '100%',
            maxWidth: contentMax,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Masthead */}
          <View style={styles.masthead}>
            <View style={styles.mastheadTop}>
              <Text style={styles.kicker}>Daily</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Flame size={15} color={C.rust} />
                  <Text style={styles.streak}>
                    {data.streak} day{data.streak === 1 ? '' : 's'}
                  </Text>
                </View>
                <Pressable onPress={() => setShowSettings(true)} hitSlop={10}>
                  <SettingsIcon size={17} color={C.inkSoft} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.h1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              Research
            </Text>
            <Text style={styles.tagline}>One paper a day, read in full.</Text>
          </View>

          {/* Topic toggle */}
          <View style={styles.toggleRow}>
            {[
              { id: 'ai', label: 'AI', Icon: Brain, col: C.ai },
              { id: 'markets', label: 'Markets', Icon: TrendingUp, col: C.mkt },
            ].map(({ id, label, Icon, col }, i) => {
              const on = topic === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    setTopic(id);
                    setPaper(null);
                    setError(null);
                    resetReader();
                  }}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor: on ? col : 'transparent',
                      borderColor: on ? col : C.line,
                      borderTopLeftRadius: i === 0 ? 6 : 0,
                      borderBottomLeftRadius: i === 0 ? 6 : 0,
                      borderTopRightRadius: i === 1 ? 6 : 0,
                      borderBottomRightRadius: i === 1 ? 6 : 0,
                      borderLeftWidth: i === 1 && !on ? 0 : 1.5,
                    },
                  ]}
                >
                  <Icon size={16} color={on ? '#fff' : C.inkSoft} />
                  <Text
                    style={[
                      styles.toggleLabel,
                      {
                        color: on ? '#fff' : C.inkSoft,
                        fontFamily: on ? 'Newsreader_500Medium' : 'Newsreader_400Regular',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Body */}
          <View style={{ paddingHorizontal: pad, paddingTop: 14 }}>
            {!paper && !loading && (
              <View style={{ alignItems: 'center', paddingVertical: 44 }}>
                <BookOpen size={34} color={accent} strokeWidth={1.4} />
                <Text style={styles.intro}>
                  {error || `Ready for today's ${topic === 'ai' ? 'AI' : 'markets'} paper?`}
                </Text>
                <Pressable onPress={fetchPaper} style={styles.cta}>
                  <Sparkles size={17} color={C.paper} />
                  <Text style={styles.ctaLabel}>Fetch today's paper</Text>
                </Pressable>
              </View>
            )}

            {loading && (
              <View style={{ alignItems: 'center', paddingVertical: 54 }}>
                <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                  <RefreshCw size={28} color={accent} />
                </Animated.View>
                <Text style={styles.searching}>Searching the archives…</Text>
              </View>
            )}

            {paper && (
              <Animated.View style={{ opacity: rise, transform: [{ translateY: riseTranslate }] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: accent, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 3 }}>
                    <Text style={styles.tag}>{paper.source}</Text>
                  </View>
                  <Text style={styles.difficulty}>{paper.difficulty}</Text>
                </View>

                <Text style={styles.title}>{paper.title}</Text>
                <Text style={styles.authors}>{paper.authors}</Text>

                <Section label="The problem" body={paper.problem} accent={accent} scale={scale} />
                <Section label="The key idea" body={paper.keyIdea} accent={accent} scale={scale} />
                <Section label="Why it matters" body={paper.whyItMatters} accent={accent} scale={scale} />

                <View style={styles.testBox}>
                  <HelpCircle size={18} color={C.rust} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.testLabel}>Test yourself</Text>
                    <Text style={styles.testQ}>{paper.studyQuestion}</Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => setViewing(true)}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: C.ink, marginBottom: 10 },
                  ]}
                >
                  <Globe size={16} color={C.paper} />
                  <Text style={[styles.actionBtnLabel, { color: C.paper }]}>
                    View the paper
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setChatOpen(true)}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: 'transparent',
                      borderWidth: 1.5,
                      borderColor: accent,
                      marginBottom: 10,
                    },
                  ]}
                >
                  <Baby size={16} color={accent} />
                  <Text style={[styles.actionBtnLabel, { color: accent }]}>
                    Explain like I'm 5
                  </Text>
                </Pressable>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={toggleReader}
                    style={[
                      styles.actionBtn,
                      {
                        borderWidth: 1.5,
                        borderColor: C.ink,
                        backgroundColor: reading ? C.ink : 'transparent',
                      },
                    ]}
                  >
                    <FileText size={15} color={reading ? '#fff' : C.ink} />
                    <Text
                      style={[
                        styles.actionBtnLabel,
                        { color: reading ? '#fff' : C.ink },
                      ]}
                    >
                      {reading ? 'Hide plain English' : 'Plain English'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={markStudied}
                    disabled={studiedToday}
                    style={[
                      styles.actionBtn,
                      { backgroundColor: studiedToday ? C.inkSoft : C.rust },
                    ]}
                  >
                    <Check size={16} color="#fff" />
                    <Text style={[styles.actionBtnLabel, { color: '#fff' }]}>
                      {studiedToday ? 'Studied' : 'Mark studied'}
                    </Text>
                  </Pressable>
                </View>

                {/* FULL in-app read */}
                {reading && (
                  <View style={styles.readerCard}>
                    <View style={styles.readerHeader}>
                      <Text style={styles.readerHeaderLabel}>The full paper</Text>
                      <Pressable
                        onPress={() => setViewing(true)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                      >
                        <Text style={styles.openOriginal}>View in app</Text>
                        <Globe size={13} color={C.rust} />
                      </Pressable>
                    </View>

                    <View style={{ padding: s(16), paddingBottom: s(18) }}>
                      {sections.map((sec, i) => (
                        <View key={i} style={{ marginBottom: 17 }}>
                          {sec.heading ? <Text style={styles.secHeading}>{sec.heading}</Text> : null}
                          <Text style={styles.secBody}>{sec.body}</Text>
                        </View>
                      ))}

                      {readLoading && (
                        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                          <Animated.View style={{ transform: [{ rotate: readSpinDeg }] }}>
                            <RefreshCw size={20} color={accent} />
                          </Animated.View>
                          <Text style={styles.readingLabel}>
                            {readWait
                              ? `Rate limited — retrying in ${readWait}s…`
                              : sections.length
                              ? 'Reading the next part…'
                              : 'Reading the paper for you…'}
                          </Text>
                        </View>
                      )}

                      {!readLoading && readError && (
                        <Pressable
                          onPress={loadMore}
                          style={[styles.continueBtn, { borderColor: C.rust }]}
                        >
                          <RotateCcw size={15} color={C.rust} />
                          <Text style={[styles.continueLabel, { color: C.rust }]}>
                            {sections.length ? 'Try the next part again' : 'Try again'}
                          </Text>
                        </Pressable>
                      )}

                      {!readLoading && !readError && !complete && sections.length > 0 && (
                        <Pressable
                          onPress={loadMore}
                          style={[styles.continueBtn, { borderColor: accent }]}
                        >
                          <ChevronDown size={16} color={accent} />
                          <Text style={[styles.continueLabel, { color: accent }]}>
                            Continue reading
                          </Text>
                        </Pressable>
                      )}

                      {!readLoading && !readError && complete && (
                        <View style={styles.completeRow}>
                          <Check size={15} color={accent} />
                          <Text style={[styles.completeLabel, { color: accent }]}>
                            You&rsquo;ve read the full paper
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                <Pressable onPress={fetchPaper} style={styles.diffBtn}>
                  <RefreshCw size={13} color={C.inkSoft} />
                  <Text style={styles.diffLabel}>Give me a different one</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>

          {/* History */}
          {data.history.length > 0 && (
            <View style={{ paddingHorizontal: pad, paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={styles.histHeader}>Recently studied</Text>
              {data.history.slice(0, 6).map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.histRow,
                    { borderBottomWidth: i < Math.min(5, data.history.length - 1) ? 1 : 0 },
                  ]}
                >
                  <Text style={[styles.histTopic, { color: h.topic === 'ai' ? C.ai : C.mkt }]}>
                    {h.topic === 'ai' ? 'AI' : 'Mkt'}
                  </Text>
                  <Text style={styles.histTitle} numberOfLines={2}>
                    {h.title}
                  </Text>
                  <Text style={styles.histDate}>{fmt(h.date)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* In-app paper viewer */}
        <Modal
          visible={viewing}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setViewing(false)}
        >
          <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top }}>
            <View style={styles.webBar}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.webBarLabel}>The paper</Text>
                <Text style={styles.webBarTitle} numberOfLines={1}>
                  {paper?.title || ''}
                </Text>
              </View>
              <Pressable onPress={() => setViewing(false)} hitSlop={10} style={styles.webClose}>
                <X size={18} color={C.ink} />
              </Pressable>
            </View>
            {paper?.url ? (
              <View style={{ flex: 1, backgroundColor: '#fff' }}>
                <WebView
                  source={{ uri: viewUrl(paper.url) }}
                  onLoadStart={() => setWebLoading(true)}
                  onLoadEnd={() => setWebLoading(false)}
                  style={{ flex: 1 }}
                  startInLoadingState
                  allowsBackForwardNavigationGestures
                  decelerationRate="normal"
                  contentInsetAdjustmentBehavior="automatic"
                />
                {webLoading && (
                  <View pointerEvents="none" style={styles.webLoadingOverlay}>
                    <ActivityIndicator color={C.ink} />
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </Modal>

        {/* ELI5 chat modal */}
        <Modal
          visible={chatOpen}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setChatOpen(false)}
        >
          <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top }}>
            <View style={styles.webBar}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.webBarLabel}>Explain like I'm 5</Text>
                <Text style={styles.webBarTitle} numberOfLines={1}>
                  {paper?.title || ''}
                </Text>
              </View>
              <Pressable onPress={() => setChatOpen(false)} hitSlop={10} style={styles.webClose}>
                <X size={18} color={C.ink} />
              </Pressable>
            </View>

            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={insets.top + s(60)}
            >
              <ScrollView
                ref={chatScrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  padding: pad,
                  paddingBottom: s(20),
                }}
                keyboardShouldPersistTaps="handled"
              >
                {messages.length === 0 ? (
                  <View>
                    <View style={styles.eli5Welcome}>
                      <Baby size={28} color={accent} strokeWidth={1.4} />
                      <Text style={styles.eli5WelcomeTitle}>
                        Hi! Ask me anything about this paper.
                      </Text>
                      <Text style={styles.eli5WelcomeBody}>
                        I'll explain it like you're 5 — short, simple, with everyday examples.
                      </Text>
                    </View>
                    <Text style={styles.eli5SuggestLabel}>Try one of these:</Text>
                    {[
                      'What is this paper really about?',
                      'Why should I care about this?',
                      "What's the hardest word in the paper?",
                      'Give me an analogy I\'ll understand.',
                    ].map((q) => (
                      <Pressable
                        key={q}
                        onPress={() => askChat(q)}
                        style={styles.eli5Chip}
                      >
                        <Text style={styles.eli5ChipText}>{q}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  messages.map((m, i) => (
                    <View
                      key={i}
                      style={[
                        styles.bubbleRow,
                        m.role === 'user' ? { justifyContent: 'flex-end' } : null,
                      ]}
                    >
                      <View
                        style={[
                          m.role === 'user' ? styles.userBubble : styles.botBubble,
                          { maxWidth: '88%' },
                        ]}
                      >
                        <Text
                          style={
                            m.role === 'user' ? styles.userBubbleText : styles.botBubbleText
                          }
                        >
                          {m.text}
                        </Text>
                      </View>
                    </View>
                  ))
                )}

                {chatLoading && (
                  <View style={[styles.bubbleRow]}>
                    <View style={styles.botBubble}>
                      <Text style={styles.thinkingText}>thinking…</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={[styles.chatInputRow, { paddingBottom: safeBottom + s(8) }]}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask anything…"
                  placeholderTextColor={C.inkSoft}
                  style={styles.chatInput}
                  multiline
                  maxLength={500}
                  onSubmitEditing={() => askChat(chatInput)}
                  blurOnSubmit={false}
                  returnKeyType="send"
                />
                <Pressable
                  onPress={() => askChat(chatInput)}
                  disabled={!chatInput.trim() || chatLoading}
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor:
                        chatInput.trim() && !chatLoading ? C.ink : C.inkSoft,
                    },
                  ]}
                >
                  <Send size={18} color={C.paper} />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Settings modal */}
        <Modal
          visible={showSettings}
          animationType="slide"
          transparent
          onRequestClose={() => {
            Keyboard.dismiss();
            setShowSettings(false);
            setTempKey('');
          }}
        >
          <KeyboardAvoidingView
            style={styles.modalScrim}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableWithoutFeedback
              onPress={() => {
                Keyboard.dismiss();
                setShowSettings(false);
                setTempKey('');
              }}
            >
              <View style={{ flex: 1 }} />
            </TouchableWithoutFeedback>
            <View style={[styles.modalCard, { paddingBottom: Math.max(s(40), safeBottom + s(24)) }]}>
              <Text style={styles.modalTitle}>API key</Text>
              <Text style={styles.modalBody}>
                Anthropic (sk-ant-…) or Google Gemini (AIza…). Auto-detected. Stored on-device only.
              </Text>
              <TextInput
                value={tempKey}
                onChangeText={setTempKey}
                placeholder="sk-ant-…  or  AIza…"
                placeholderTextColor={C.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.keyInput}
              />
              {tempKey ? (
                <Text style={styles.keyStatus}>
                  {providerForKey(tempKey)
                    ? `Detected: ${providerForKey(tempKey) === 'anthropic' ? 'Anthropic Claude' : 'Google Gemini'}`
                    : 'Unknown key format'}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={() => {
                    setShowSettings(false);
                    setTempKey('');
                  }}
                  style={[styles.actionBtn, { borderWidth: 1.5, borderColor: C.ink, flex: 1 }]}
                >
                  <Text style={styles.actionBtnLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveKey}
                  style={[styles.actionBtn, { backgroundColor: C.ink, flex: 1 }]}
                >
                  <Text style={[styles.actionBtnLabel, { color: C.paper }]}>Save</Text>
                </Pressable>
              </View>
              {apiKey ? (
                <Text style={styles.keyStatus}>
                  {providerForKey(apiKey) === 'gemini' ? 'Gemini' : 'Anthropic'} key saved · ends in {apiKey.slice(-4)}
                </Text>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </>
  );
}

function Section({ label, body, accent, scale = 1 }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 11 * scale,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: accent,
          marginBottom: 4,
          fontFamily: 'Newsreader_500Medium',
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 16.5 * scale, lineHeight: 24 * scale, color: C.ink, fontFamily: 'Newsreader_400Regular' }}>
        {body}
      </Text>
    </View>
  );
}

const makeStyles = (s, pad, isCompact, isSmall, isLarge) => StyleSheet.create({
  masthead: {
    paddingHorizontal: pad,
    paddingTop: s(18),
    paddingBottom: s(18),
    borderBottomWidth: 2,
    borderBottomColor: C.ink,
  },
  mastheadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: {
    fontSize: s(11),
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: C.inkSoft,
    fontFamily: 'Newsreader_400Regular',
  },
  streak: { fontSize: s(13), color: C.rust, fontFamily: 'Newsreader_500Medium' },
  h1: {
    fontFamily: 'Fraunces_900Black',
    fontSize: s(44),
    lineHeight: s(44),
    marginTop: 6,
    marginBottom: 4,
    letterSpacing: -1,
    color: C.ink,
  },
  tagline: { fontSize: s(14), fontFamily: 'Newsreader_400Regular_Italic', color: C.inkSoft },
  toggleRow: { flexDirection: 'row', paddingHorizontal: pad, paddingTop: 16, paddingBottom: 4 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: s(11),
    borderWidth: 1.5,
  },
  toggleLabel: { fontSize: s(16) },
  intro: {
    color: C.inkSoft,
    fontFamily: 'Newsreader_400Regular',
    marginTop: 14,
    marginBottom: 22,
    fontSize: s(16),
    lineHeight: s(24),
    textAlign: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: s(13),
    paddingHorizontal: s(26),
    backgroundColor: C.ink,
    borderRadius: 30,
  },
  ctaLabel: { color: C.paper, fontFamily: 'Newsreader_500Medium', fontSize: s(17) },
  searching: { marginTop: 16, fontFamily: 'Newsreader_400Regular_Italic', fontSize: s(15), color: C.inkSoft },
  tag: {
    fontSize: s(10),
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#fff',
    fontFamily: 'Newsreader_500Medium',
  },
  difficulty: {
    fontSize: s(11),
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.inkSoft,
    fontFamily: 'Newsreader_400Regular',
  },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: s(25), lineHeight: s(29), marginBottom: 6, color: C.ink },
  authors: { marginBottom: 18, fontSize: s(13.5), fontFamily: 'Newsreader_400Regular_Italic', color: C.inkSoft },
  testBox: {
    backgroundColor: C.paperDark,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: s(14),
    marginBottom: 20,
    flexDirection: 'row',
    gap: 11,
  },
  testLabel: {
    fontSize: s(11),
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.rust,
    marginBottom: 3,
    fontFamily: 'Newsreader_500Medium',
  },
  testQ: { fontSize: s(15.5), lineHeight: s(22), color: C.ink, fontFamily: 'Newsreader_400Regular' },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: s(12),
    borderRadius: 8,
  },
  actionBtnLabel: { fontSize: s(15), color: C.ink, fontFamily: 'Newsreader_500Medium' },
  readerCard: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fdfbf6',
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(14),
    paddingVertical: s(9),
    backgroundColor: C.paperDark,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  readerHeaderLabel: {
    fontSize: s(11),
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.inkSoft,
    fontFamily: 'Newsreader_500Medium',
  },
  openOriginal: {
    fontSize: s(12.5),
    color: C.rust,
    fontFamily: 'Newsreader_500Medium',
  },
  secHeading: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: s(17.5),
    lineHeight: s(21),
    marginBottom: 6,
    color: C.ink,
  },
  secBody: {
    fontSize: s(15.5),
    lineHeight: s(25),
    color: C.ink,
    fontFamily: 'Newsreader_400Regular',
  },
  readingLabel: {
    marginTop: 10,
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: s(14),
    color: C.inkSoft,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: s(11),
    borderWidth: 1.5,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  continueLabel: { fontFamily: 'Newsreader_500Medium', fontSize: s(15) },
  completeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  completeLabel: { fontSize: s(13.5), fontFamily: 'Newsreader_500Medium' },
  diffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
  },
  diffLabel: { color: C.inkSoft, fontFamily: 'Newsreader_400Regular', fontSize: s(14) },
  histHeader: {
    fontSize: s(11),
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.inkSoft,
    marginTop: 16,
    marginBottom: 10,
    fontFamily: 'Newsreader_400Regular',
  },
  histRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomColor: C.line,
    alignItems: 'center',
  },
  histTopic: {
    fontSize: s(11),
    width: s(42),
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Newsreader_500Medium',
  },
  histTitle: { flex: 1, fontSize: s(14), lineHeight: s(19), color: C.ink, fontFamily: 'Newsreader_400Regular' },
  histDate: { fontSize: s(12), color: C.inkSoft, fontFamily: 'Newsreader_400Regular' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: C.paper,
    paddingHorizontal: pad,
    paddingTop: s(22),
    paddingBottom: s(40),
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontFamily: 'Fraunces_600SemiBold', fontSize: s(22), color: C.ink, marginBottom: 6 },
  modalBody: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(14),
    color: C.inkSoft,
    marginBottom: 14,
    lineHeight: s(20),
  },
  keyInput: {
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: s(12),
    paddingVertical: s(11),
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(15),
    color: C.ink,
    backgroundColor: C.paperDark,
  },
  keyStatus: {
    marginTop: 12,
    fontSize: s(12),
    color: C.inkSoft,
    fontFamily: 'Newsreader_400Regular_Italic',
  },
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: pad,
    paddingVertical: s(12),
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.paper,
  },
  webBarLabel: {
    fontSize: s(10),
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.inkSoft,
    fontFamily: 'Newsreader_400Regular',
    marginBottom: 2,
  },
  webBarTitle: {
    fontSize: s(15),
    color: C.ink,
    fontFamily: 'Fraunces_600SemiBold',
  },
  webClose: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.paperDark,
  },
  webLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243, 237, 225, 0.6)',
  },
  eli5Welcome: {
    alignItems: 'center',
    paddingVertical: s(24),
    marginBottom: s(8),
  },
  eli5WelcomeTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: s(20),
    color: C.ink,
    marginTop: s(12),
    marginBottom: s(6),
    textAlign: 'center',
  },
  eli5WelcomeBody: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(15),
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: s(22),
    paddingHorizontal: s(8),
  },
  eli5SuggestLabel: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(11),
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.inkSoft,
    marginBottom: s(10),
    marginTop: s(6),
  },
  eli5Chip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: s(11),
    paddingHorizontal: s(14),
    marginBottom: s(8),
    backgroundColor: '#fdfbf6',
  },
  eli5ChipText: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(15),
    color: C.ink,
    lineHeight: s(21),
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: s(10),
  },
  userBubble: {
    backgroundColor: C.ink,
    paddingHorizontal: s(14),
    paddingVertical: s(10),
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  userBubbleText: {
    color: C.paper,
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(15.5),
    lineHeight: s(22),
  },
  botBubble: {
    backgroundColor: '#fdfbf6',
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: s(14),
    paddingVertical: s(11),
    borderRadius: 18,
    borderBottomLeftRadius: 6,
  },
  botBubbleText: {
    color: C.ink,
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(15.5),
    lineHeight: s(24),
  },
  thinkingText: {
    color: C.inkSoft,
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: s(14),
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: pad,
    paddingTop: s(10),
    gap: s(8),
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.paper,
  },
  chatInput: {
    flex: 1,
    minHeight: s(40),
    maxHeight: s(120),
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 18,
    paddingHorizontal: s(14),
    paddingTop: s(10),
    paddingBottom: s(10),
    fontFamily: 'Newsreader_400Regular',
    fontSize: s(15),
    color: C.ink,
    backgroundColor: C.paperDark,
  },
  sendBtn: {
    width: s(44),
    height: s(44),
    borderRadius: s(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
