import type { UserProfile, Character } from "../types";
import { roles, roleApplications } from "../data/profile";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Avatar } from "./Avatar";
import { RoleArt } from "./RoleArt";
import { loopIndex, loopScrollShift } from "../data/roleLoop";
import { RoleResearch } from "./ContactSettings";

export function AvatarPicker({
  profile,
  onChange,
  disabled = false,
}: {
  profile: UserProfile;
  onChange: (profile: UserProfile) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Choose your companion</legend>
      <div className="avatar-options">
        {(["cat", "dog", "seal", "bird"] as Character[]).map((character) => (
          <button
            type="button"
            className="avatar-option"
            aria-pressed={profile.avatar.character === character}
            key={character}
            onClick={() =>
              onChange({ ...profile, avatar: { ...profile.avatar, character } })
            }
          >
            <Avatar
              appearance={{ ...profile.avatar, visible: true, character }}
              state="fun"
            />
            <span>{character[0].toUpperCase() + character.slice(1)}</span>
          </button>
        ))}
      </div>
      <span className="field-label">Companion color</span>
      <div className="color-options" role="group" aria-label="Companion color">
        {[
          { name: "Red", value: "#EF6B6B" },
          { name: "Yellow", value: "#F2C94C" },
          { name: "Blue", value: "#4B8EF5" },
        ].map((color) => (
          <button
            type="button"
            key={color.value}
            aria-pressed={profile.avatar.color === color.value}
            onClick={() =>
              onChange({
                ...profile,
                avatar: { ...profile.avatar, color: color.value },
              })
            }
          >
            <span style={{ background: color.value }} />
            {color.name}
            {profile.avatar.color === color.value && <Check size={13} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function PrivacyNotice() {
  return (
    <details id="profile-privacy-notice" className="inline-details">
      <summary>Privacy notice — draft</summary>
      <p>
        This is a product placeholder. Replace it with the final reviewed
        Privacy Policy before a public release.
      </p>
      <p>
        Your name, email, role, declared apps and choices are saved on this
        device. Optional role research sends only the email, role and apps you
        enter, after your explicit consent, to the configured private contact
        service. Confirm the email request before that profile is counted as
        verified. Research does not subscribe you to marketing. Activity
        tracking and AI sharing have separate controls. Your email is not added
        to AI requests.
      </p>
    </details>
  );
}
export function IdentityFields({
  profile,
  onChange,
  disabled = false,
}: {
  profile: UserProfile;
  onChange: (profile: UserProfile) => void;
  disabled?: boolean;
}) {
  const [appsDraft, setAppsDraft] = useState(
    (profile.applications ?? []).join(", "),
  );
  return (
    <fieldset disabled={disabled}>
      <legend>Your profile</legend>
      <RoleCarousel
        role={profile.role}
        onChange={(role) => onChange({ ...profile, role })}
        disabled={disabled}
      />
      {profile.role === "other" && (
        <div className="custom-role-fields">
          <label htmlFor="profile-custom-role">Your role</label>
          <input
            id="profile-custom-role"
            required
            maxLength={120}
            value={profile.custom_role ?? ""}
            placeholder="Musician, artist, parent, or anything that fits you"
            onChange={(event) =>
              onChange({ ...profile, custom_role: event.target.value })
            }
          />
        </div>
      )}
      {profile.role && (
        <div className="declared-apps-fields">
          <label htmlFor="profile-apps">Apps you use (optional)</label>
          <textarea
            id="profile-apps"
            rows={2}
            maxLength={1700}
            value={appsDraft}
            placeholder="For example: Ableton Live, Canva, Notion"
            onChange={(event) => {
              setAppsDraft(event.target.value);
              onChange({
                ...profile,
                applications: [
                  ...new Set(
                    event.target.value
                      .split(/[,;\n]/)
                      .map((app) => app.trim())
                      .filter(Boolean),
                  ),
                ],
              });
            }}
          />
          <p className="helper">
            Separate names with commas. Up to 20 apps. These names do not create
            tracking rules.
          </p>
        </div>
      )}
      <label htmlFor="profile-name">Name</label>
      <input
        id="profile-name"
        autoComplete="name"
        required
        maxLength={120}
        value={profile.name}
        onChange={(e) => onChange({ ...profile, name: e.target.value })}
      />
      <label htmlFor="profile-email">Email</label>
      <input
        id="profile-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={profile.email}
        onChange={(e) => onChange({ ...profile, email: e.target.value })}
      />
      <PrivacyNotice />
      <label className="privacy-ack">
        <input
          type="checkbox"
          required
          checked={profile.privacy_accepted}
          onChange={(e) =>
            onChange({ ...profile, privacy_accepted: e.target.checked })
          }
        />
        I have read the draft privacy notice and agree to save my name and email
        locally.
      </label>
      <RoleResearch profile={profile} disabled={disabled} />
    </fieldset>
  );
}

export function RoleCarousel({
  role,
  onChange,
  disabled,
}: {
  role: string;
  onChange: (role: string) => void;
  disabled: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const position = useRef(roles.length * 2);
  const lastRole = useRef(role);
  const frame = useRef(0);
  const navigating = useRef(false);
  const settled = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeated = Array.from({ length: 5 }, (_, group) =>
    roles.map((item, index) => ({
      item,
      index,
      group,
      virtual: group * roles.length + index,
    })),
  ).flat();
  function move(index: number, smooth = true) {
    const container = rail.current;
    const card = container?.children[index] as HTMLElement | undefined;
    if (!container || !card) return;
    position.current = index;
    navigating.current = smooth;
    container.scrollTo({
      left: card.offsetLeft - (container.clientWidth - card.offsetWidth) / 2,
      behavior:
        smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
  }
  function choose(index: number) {
    if (disabled) return;
    const next = loopIndex(index, roles.length);
    lastRole.current = roles[next].id;
    onChange(roles[next].id);
    move(index);
  }
  const selected = roles.findIndex((item) => item.id === role);
  useLayoutEffect(() => {
    move(roles.length * 2 + Math.max(0, selected), false);
    const container = rail.current;
    if (!container) return;
    const wheel = (event: WheelEvent) => {
      navigating.current = false;
      if (
        disabled ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        event.ctrlKey
      )
        return;
      event.preventDefault();
      container.scrollLeft +=
        event.deltaY *
        (event.deltaMode === 1
          ? 24
          : event.deltaMode === 2
            ? container.clientWidth
            : 1);
    };
    container.addEventListener("wheel", wheel, { passive: false });
    const resize = new ResizeObserver(() => move(position.current, false));
    resize.observe(container);
    return () => {
      container.removeEventListener("wheel", wheel);
      resize.disconnect();
      cancelAnimationFrame(frame.current);
      clearTimeout(settled.current);
    };
  }, [disabled]);
  useEffect(() => {
    if (lastRole.current !== role) {
      lastRole.current = role;
      move(roles.length * 2 + Math.max(0, selected));
    }
  }, [role, selected]);
  function rebase() {
    const container = rail.current;
    if (!container) return;
    const cards = container.children;
    const width =
      (cards[roles.length] as HTMLElement).offsetLeft -
      (cards[0] as HTMLElement).offsetLeft;
    const shift = loopScrollShift(container.scrollLeft, width);
    const stride = width / roles.length;
    if (!navigating.current)
      position.current = Math.round(
        (container.scrollLeft +
          container.clientWidth / 2 -
          (cards[0] as HTMLElement).offsetLeft -
          (cards[0] as HTMLElement).offsetWidth / 2) /
          stride,
      );
    clearTimeout(settled.current);
    settled.current = setTimeout(() => {
      navigating.current = false;
    }, 180);
    if (!shift) return;
    container.style.scrollSnapType = "none";
    container.scrollLeft += shift;
    position.current += Math.round(shift / width) * roles.length;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      container.style.scrollSnapType = "";
      if (navigating.current) move(position.current);
    });
  }
  return (
    <section className="role-picker" aria-label="Choose your role">
      <div className="section-heading">
        <h3>Choose your role</h3>
        <div className="role-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous role"
            disabled={disabled}
            onClick={() => choose(position.current - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next role"
            disabled={disabled}
            onClick={() => choose(position.current + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div
        className="role-rail"
        ref={rail}
        role="group"
        aria-label="Professional roles"
        onScroll={rebase}
        onPointerDown={() => {
          navigating.current = false;
        }}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            choose(position.current + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      >
        {repeated.map(({ item, index, group, virtual }) => {
          const Card = group === 2 ? "button" : "div";
          return (
            <Card
              key={`${group}-${item.id}`}
              {...(group === 2
                ? {
                    type: "button" as const,
                    "aria-pressed": role === item.id,
                    disabled,
                  }
                : { "aria-hidden": true })}
              className={`role-story${role === item.id ? " selected" : ""}`}
              data-role={item.id}
              onClick={() => choose(virtual)}
              onFocus={group === 2 ? () => move(virtual) : undefined}
            >
              <span className="role-number">
                {String(index + 1).padStart(2, "0")}{" "}
                {role === item.id && <Check size={14} />}
              </span>
              <RoleArt index={index} />
              <strong>{item.name}</strong>
              <span className="role-description">
                {
                  [
                    "Build something useful.",
                    "Turn ideas into momentum.",
                    "Bring the right things together.",
                    "Make your vision visible.",
                    "Help your message travel.",
                    "Make meaningful connections.",
                    "Explore the next opportunity.",
                    "Keep things moving smoothly.",
                    "A space for whatever you do.",
                  ][index]
                }
              </span>
              <span className="role-tools-label">
                {item.id === "other" ? "Your own tools" : "Typical tools"}
              </span>
              <span className="role-tools">
                {roleApplications(item.id)
                  .filter((app) => app.category === "work")
                  .slice(0, 4)
                  .map((app) => (
                    <span key={app.process}>{app.name}</span>
                  ))}
                {item.id === "other" && <span>Tell us what you use</span>}
              </span>
            </Card>
          );
        })}
      </div>
      <p className="helper">
        Swipe, scroll or use arrows — roles loop continuously. Typical tools are
        suggestions, not detected installations.
      </p>
    </section>
  );
}
