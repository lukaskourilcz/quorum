"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceChannelId } from "@/lib/meeting-feed";
import type { OfficeChannel, OfficeMessage } from "@/lib/office-walkthrough";
import { WALKTHROUGH_PANEL_ZOOM } from "@/components/office/panel-zoom";

/**
 * The BoardlessAI Workspace: a player, not a chat.
 *
 * It replays a recorded meeting message by message and offers no way to post — there is no
 * composer, no send button and no playback transport, because the thing on screen is a record and
 * a record is not something a visitor can add to.
 *
 * A room plays once. The first time a channel and day are opened they reveal message by message;
 * coming back shows the whole record at once, because a record is not a replayable video. The
 * `played` set is a ref rather than state: re-rendering on it would restart the very reveal it is
 * there to remember.
 */

const AVATAR_ANON = "linear-gradient(150deg,#26262b,#17171a)";

function MessageAvatar({ message }: { message: OfficeMessage }) {
  if (message.initials === null) return null;
  // No photographs in the message list: at 36px a portrait reads as noise rather than identity.
  // A role with an approved portrait gets an initials tile; a role without one keeps the
  // silhouette, so the difference between "we have a face for this role" and "we do not" survives.
  if (message.known) {
    return (
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[5px] border border-[#2e2e34] bg-[#16161a] font-mono text-[12.5px] font-semibold tracking-[0.04em] text-[#d4d4d8]"
      >
        {message.initials}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="relative block size-9 shrink-0 overflow-hidden rounded-[5px]"
      style={{ background: AVATAR_ANON }}
    >
      <span className="absolute left-1/2 top-2 size-3 -translate-x-1/2 rounded-full bg-[#5f5f68]" />
      <span className="absolute -bottom-[7px] left-1/2 h-[17px] w-6 -translate-x-1/2 rounded-t-[12px] bg-[#5f5f68]" />
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 py-2 pl-[68px] pr-[22px]" data-typing>
      <span className="inline-flex gap-1 rounded-full border border-[#26262b] bg-[#0e0e11] px-3 py-2">
        <span className="size-[5px] rounded-full bg-[#a1a1aa] [animation:bai-dot_1.1s_ease-in-out_infinite]" />
        <span className="size-[5px] rounded-full bg-[#a1a1aa] [animation:bai-dot_1.1s_ease-in-out_.16s_infinite]" />
        <span className="size-[5px] rounded-full bg-[#a1a1aa] [animation:bai-dot_1.1s_ease-in-out_.32s_infinite]" />
      </span>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#94949c]">typing…</span>
    </div>
  );
}

export function SectionMeetings({
  channels,
  channelId,
  day,
  onSelect,
  reduceMotion,
  visible
}: {
  channels: OfficeChannel[];
  channelId: WorkspaceChannelId;
  /** The day being shown, `YYYY-MM-DD`. `null` means "the newest day this channel has". */
  day: string | null;
  onSelect: (channel: WorkspaceChannelId, day: string | null) => void;
  reduceMotion: boolean;
  /** True once section 02 has been at least 40% on screen, which is what starts the first play. */
  visible: boolean;
}) {
  const [revealed, setRevealed] = useState(0);
  const [typing, setTyping] = useState(false);
  const [openJson, setOpenJson] = useState<string | null>(null);
  const [dateMenu, setDateMenu] = useState(false);
  /**
   * Which rooms the visitor has opened, for the sidebar's unread dot.
   *
   * State rather than the `played` ref, even though the two track almost the same thing. The ref
   * exists so a re-render cannot restart a reveal, which means writing to it does not repaint —
   * and a dot read from it would have stayed lit on a room the visitor was currently reading.
   */
  const [opened, setOpened] = useState<readonly string[]>([]);

  const paneRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedRef = useRef(new Set<string>());
  const detachedRef = useRef(false);

  const channel = useMemo(
    () => channels.find((entry) => entry.id === channelId) ?? channels[0]!,
    [channels, channelId]
  );
  const activeDay = day ?? channel.days.at(-1)?.date ?? null;
  const playing = useMemo(
    () => channel.days.find((entry) => entry.date === activeDay) ?? null,
    [channel, activeDay]
  );
  const total = playing?.messages.length ?? 0;
  const playKey = `${channel.id}:${activeDay ?? ""}`;

  /** Keep the newest message in view while the record plays, unless the visitor scrolled. */
  const followBottom = useCallback(() => {
    const pane = paneRef.current;
    if (!pane || detachedRef.current) return;
    requestAnimationFrame(() => {
      if (pane.scrollHeight - (pane.scrollTop + pane.clientHeight) > 0) pane.scrollTop = pane.scrollHeight;
    });
  }, []);

  /**
   * The reveal loop.
   *
   * Deliberately uneven — 300–800 ms of typing, then 240–600 ms of quiet — because a constant
   * interval reads as a progress bar rather than as people talking. It never blocks: scrolling the
   * pane detaches the auto-follow and nothing else.
   */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!playing || !visible) return;

    const seen = playedRef.current.has(playKey);
    if (seen || reduceMotion) {
      setRevealed(total);
      setTyping(false);
      return;
    }
    playedRef.current.add(playKey);
    detachedRef.current = false;
    setRevealed(0);
    setTyping(false);

    let cancelled = false;
    let index = 0;
    const step = () => {
      if (cancelled || index >= total) {
        setTyping(false);
        return;
      }
      setTyping(true);
      followBottom();
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        index += 1;
        setRevealed(index);
        setTyping(false);
        followBottom();
        timerRef.current = setTimeout(step, 240 + Math.random() * 360);
      }, 300 + Math.random() * 500);
    };
    timerRef.current = setTimeout(step, 420);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playKey, playing, total, visible, reduceMotion, followBottom]);

  /** Opening a channel puts that day's divider at the top; older days stay above, static. */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !activeDay) return;
    const anchor = pane.querySelector<HTMLElement>(`[data-day="${activeDay}"]`);
    pane.scrollTop = anchor ? Math.max(0, anchor.offsetTop - pane.offsetTop - 6) : pane.scrollHeight;
    setOpenJson(null);
    setDateMenu(false);
  }, [playKey, activeDay]);

  useEffect(() => {
    if (!dateMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDateMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dateMenu]);

  return (
    <div
      className="w-full max-w-[1280px] rounded-[16px] border-[10px] border-[#0d0d10] bg-[#08080a] shadow-[0_60px_140px_rgba(0,0,0,.72),0_0_0_1px_rgba(255,255,255,.05)]"
      style={WALKTHROUGH_PANEL_ZOOM}
    >
      <div
        className="flex h-[76svh] flex-col overflow-hidden rounded-[7px] bg-[#0a0a0c] md:h-[574px] md:flex-row lg:h-[656px]"
        data-chat-window
      >
        <div
          className="flex w-full shrink-0 flex-row items-center border-b border-[#1e1e22] bg-[#0c0c0f] md:w-[212px] md:flex-col md:items-stretch md:border-b-0 md:border-r lg:w-[258px]"
          data-chat-side
        >
          <div className="hidden border-b border-[#1e1e22] px-[18px] py-4 md:block" data-chat-brand>
            <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#f4f4f5]">
              BoardlessAI Workspace <span className="text-[11px] text-[#94949c]">▾</span>
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
              {channels.length} channels · read-only record
            </p>
          </div>
          <p className="hidden px-[18px] pb-2 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c] md:block" data-chat-label>
            ▾ Channels
          </p>
          <div
            className="flex flex-1 gap-1.5 overflow-x-auto p-2 md:flex-col md:gap-0 md:overflow-x-hidden md:overflow-y-auto md:px-2 md:pb-3 md:pt-0"
            data-chat-list
            data-horizontal-scroll
          >
            {channels.map((entry) => {
              const active = entry.id === channel.id;
              const unread = !active && entry.days.length > 0 && !opened.includes(entry.id);
              return (
                <button
                  aria-current={active ? "true" : undefined}
                  className="mb-0 flex w-auto shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-l-2 px-2.5 py-2 text-left font-mono text-[12.5px] transition-colors md:mb-0.5 md:w-full md:shrink"
                  key={entry.id}
                  onClick={() => {
                    setOpened((seen) => (seen.includes(entry.id) ? seen : [...seen, entry.id]));
                    onSelect(entry.id, null);
                  }}
                  style={{
                    background: active ? "color-mix(in srgb, var(--bai-accent) 15%, transparent)" : "transparent",
                    borderLeftColor: active ? "var(--bai-accent)" : "transparent",
                    color: active ? "#ffffff" : unread ? "#f4f4f5" : "#a1a1aa",
                    fontWeight: active || unread ? 600 : 400
                  }}
                  type="button"
                >
                  <span className="text-[#94949c]">#</span>
                  <span className="min-w-0 truncate">{entry.handle}</span>
                  {unread ? (
                    <span aria-hidden="true" className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--bai-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-start gap-3 border-b border-[#1e1e22] px-3.5 py-3 md:flex-nowrap md:gap-[18px] md:px-5 md:py-3.5" data-chat-head>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="font-mono text-[15px] font-semibold tracking-[-0.01em] text-[#f4f4f5]">
                  <span className="text-[#94949c]">#</span>
                  {channel.handle}
                </p>
                {/* Hidden until the title line actually fits on one row; a lone 1px rule at the
                    end of a wrapped line reads as a stray mark rather than as a separator. */}
                <span aria-hidden="true" className="hidden h-[13px] w-px bg-[#2e2e34] md:inline-block" />
                <span className="text-[12.5px] text-[#94949c]">
                  {channel.room} · {channel.time}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-[1.45] text-[#94949c]">{channel.topic}</p>
            </div>
            <div className="relative ml-auto shrink-0">
              <button
                aria-expanded={dateMenu}
                aria-haspopup="menu"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#3f3f46] bg-[#101013] px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa]"
                onClick={() => setDateMenu((open) => !open)}
                type="button"
              >
                Jump to date ▾
              </button>
              {dateMenu ? (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] z-30 w-[252px] rounded-[12px] border border-[#3f3f46] bg-[#0c0c0f] p-2 shadow-[0_30px_70px_rgba(0,0,0,.7)]"
                  role="menu"
                >
                  {channel.days.length === 0 ? (
                    <p className="px-2.5 py-2 text-[12.5px] text-[#94949c]">This room has not met yet.</p>
                  ) : (
                    [...channel.days].reverse().map((entry) => (
                      <button
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors"
                        key={entry.date}
                        onClick={() => {
                          onSelect(channel.id, entry.date);
                          setDateMenu(false);
                        }}
                        role="menuitem"
                        style={{
                          background: entry.date === activeDay ? "#1f1f24" : "transparent",
                          color: entry.date === activeDay ? "#ffffff" : "#d4d4d8"
                        }}
                        type="button"
                      >
                        <span>{entry.label}</span>
                        <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]">
                          {entry.date === activeDay ? "playing" : entry.quiet ? "no meeting" : "record"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto pb-[18px] pt-2 [overscroll-behavior:contain]"
            onWheel={() => {
              detachedRef.current = true;
            }}
            ref={paneRef}
          >
            {channel.days.length === 0 ? (
              <p className="px-[22px] py-8 text-[13px] leading-[1.6] text-[#94949c]">
                This room has no record in the last three weeks. That is the room saying nothing
                happened, not the page failing to load it.
              </p>
            ) : null}
            {channel.days.map((entry) => {
              const isPlaying = entry.date === activeDay;
              const limit = isPlaying && !reduceMotion ? revealed : entry.messages.length;
              return (
                <div key={entry.date}>
                  <div className="mx-[14px] mb-3 mt-[18px] flex items-center gap-3.5 md:mx-[22px]" data-day={entry.date}>
                    <span className="h-px flex-1 bg-[#1e1e22]" />
                    <span className="rounded-full border border-[#2e2e34] bg-[#0e0e11] px-[13px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#a1a1aa]">
                      {entry.label}
                    </span>
                    <span className="h-px flex-1 bg-[#1e1e22]" />
                  </div>
                  {entry.messages.slice(0, limit).map((message) => {
                    if (message.kind === "system") {
                      return (
                        <div className="flex items-center gap-2.5 px-3.5 py-[7px] md:px-[22px]" data-sys key={message.id}>
                          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#3f3f46]" />
                          <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-[#94949c]">
                            {message.text}
                          </span>
                        </div>
                      );
                    }
                    if (message.kind === "decision") {
                      return (
                        <div
                          className="mb-3 ml-[60px] mr-3.5 mt-2.5 rounded-[12px] border p-[15px_18px] md:ml-[68px] md:mr-[22px]"
                          data-dec
                          key={message.id}
                          style={{
                            borderColor: "var(--bai-accent)",
                            background: "linear-gradient(180deg, rgba(255,90,0,.15), rgba(255,90,0,.04))"
                          }}
                        >
                          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--bai-accent)]">
                            Decision · {message.time}
                          </p>
                          <p className="mt-2 text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-[#f4f4f5]">
                            {message.text}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div
                        className="flex gap-2.5 px-3.5 py-1.5 transition-colors hover:bg-[#0f0f13] md:px-[22px]"
                        data-msg
                        key={message.id}
                      >
                        <MessageAvatar message={message} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-[9px] gap-y-1">
                            <span className="font-mono text-[13px] font-semibold text-[#f4f4f5]">
                              {message.author === "system" ? "BoardlessAI" : message.author}
                            </span>
                            {message.role ? <span className="text-[12px] text-[#94949c]">{message.role}</span> : null}
                            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[#94949c]">
                              {message.time}
                            </span>
                          </div>
                          <p
                            className="mt-[3px] max-w-[72ch] text-[14.5px] leading-[1.48] text-[#d4d4d8] md:text-[15px]"
                            data-msg-text
                            style={{ textWrap: "pretty" }}
                          >
                            {message.text}
                          </p>
                          {message.json ? (
                            <div className="mt-[11px]">
                              <button
                                aria-expanded={openJson === message.id}
                                className="rounded-md border border-[#3f3f46] bg-[#0e0e11] px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa]"
                                onClick={() => setOpenJson((open) => (open === message.id ? null : message.id))}
                                type="button"
                              >
                                Show the delivered article (.json)
                              </button>
                              {openJson === message.id ? (
                                <>
                                  {message.jsonNote ? (
                                    <p className="mt-2.5 text-[12.5px] leading-[1.5] text-[#94949c]">
                                      {message.jsonNote}
                                    </p>
                                  ) : null}
                                  <pre
                                    className="mt-2.5 max-h-[320px] overflow-auto rounded-[10px] border border-[#26262b] bg-[#08080a] p-3.5 font-mono text-[11px] leading-[1.55] text-[#d4d4d8]"
                                    tabIndex={0}
                                  >
                                    {message.json}
                                  </pre>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {isPlaying && typing && limit < entry.messages.length ? <TypingIndicator /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
