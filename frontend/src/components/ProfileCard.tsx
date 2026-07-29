import { useState, useEffect } from "react";
import type { MatchedChild, ChildDoc } from "../api";

interface Props {
  /** Supply EITHER a MatchedChild (review step) OR a full ChildDoc (roster). */
  matched?: MatchedChild;
  doc?: ChildDoc;
  /** Hide the match badge (used in Roster view). */
  hideBadge?: boolean;
}

/**
 * Reusable profile card:
 *  - Avatar (photo or placeholder)
 *  - Info pills (balgruha, class, DOB, school, parent status, languages)
 *  - Strengths / Weakness rows
 *  - Match badge (optional)
 */
export default function ProfileCard({ matched, doc, hideBadge }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  // Normalise data source
  const profile = matched?.profile ?? {};
  const name =
    doc?.child_name ?? matched?.db_name ?? matched?.name ?? "Unknown";
  const photoUrlRaw = doc?.photo_url ?? profile.photo_url ?? "";

  // Convert GCS private URLs, PureStore URLs, or simple filenames to local uploads proxy API URLs
  let photoUrl = photoUrlRaw;
  if (photoUrl) {
    if (photoUrl.startsWith("http")) {
      if (photoUrl.includes("storage.googleapis.com")) {
        const parts = photoUrl.split("/");
        const filename = parts[parts.length - 1];
        photoUrl = `/api/uploads/${filename}`;
      } else if (photoUrl.includes("purestore.io")) {
        const parts = photoUrl.split("/");
        const filename = parts[parts.length - 1];
        const folder = parts[parts.length - 2];
        photoUrl = `/api/purestore/${folder}/${filename}`;
      }
    } else if (!photoUrl.startsWith("/")) {
      photoUrl = `/api/uploads/${photoUrl}`;
    }
  }

  // Reset imgFailed state if the document/photo changes
  const childId = doc?._id ?? matched?.db_id ?? "";
  useEffect(() => {
    setImgFailed(false);
  }, [childId, photoUrlRaw]);

  const balgruha = doc?.balgruha_name ?? profile.balgruha_name ?? "";
  const classs = doc?.class_studying ?? profile.class_studying ?? "";
  const dob = doc?.dob ?? profile.dob ?? "";
  const school = doc?.school ?? profile.school ?? "";
  const parentStatus = doc?.parent_status ?? profile.parent_status ?? "";
  const languages = doc?.languages ?? profile.languages ?? "";
  const strengths = doc?.strengths ?? profile.strengths ?? "";
  const weakness = doc?.weakness ?? profile.weakness ?? "";
  const nature = doc?.nature_behavior ?? doc?.nature ?? "";

  // Match badge
  let badge: React.ReactNode = null;
  if (matched && !hideBadge) {
    const mt = matched.match_type;
    const ms = matched.match_score;
    if (mt === "exact") {
      badge = (
        <span className="match-badge match-exact">
          <span className="msym" aria-hidden="true">check_circle</span> Exact Match
        </span>
      );
    } else if (mt === "high") {
      badge = (
        <span className="match-badge match-high">
          <span className="msym" aria-hidden="true">search</span> Fuzzy ·{" "}
          {ms}% confidence
        </span>
      );
    } else if (mt === "medium") {
      badge = (
        <span className="match-badge match-medium">
          <span className="msym" aria-hidden="true">warning</span> Fuzzy ·{" "}
          {ms}% — verify name
        </span>
      );
    } else {
      badge = (
        <span className="match-badge match-none">
          <span className="msym" aria-hidden="true">cancel</span> Not Found in DB
        </span>
      );
    }
  }

  const pills: { icon: string; label: string }[] = [];
  if (balgruha) pills.push({ icon: "school", label: balgruha });
  if (classs) pills.push({ icon: "menu_book", label: `Class ${classs}` });
  if (dob && dob !== "None") pills.push({ icon: "cake", label: dob });
  if (school) pills.push({ icon: "account_balance", label: school });
  if (parentStatus) pills.push({ icon: "family_restroom", label: parentStatus });
  if (languages) pills.push({ icon: "record_voice_over", label: languages });

  // Infer trauma category from text fields
  const getChildTraumaCategory = (k: any): string => {
    if (k.trauma_category) return k.trauma_category;
    const text = [
      k.nature,
      k.nature_behavior,
      k.weakness,
      k.strengths,
      k.parent_status,
      k.dob
    ].join(" ").toLowerCase();
    
    if (text.includes("jail") || text.includes("murder") || text.includes("crime")) {
      return "Parental Incarceration";
    }
    if (text.includes("orphan") || text.includes("abandon") || text.includes("parent status: none")) {
      return "Abandonment / Neglect";
    }
    if (text.includes("anxious") || text.includes("withdrawn") || text.includes("fear") || text.includes("shy")) {
      return "Emotional / Anxiety";
    }
    if (text.includes("one parent") || text.includes("single parent") || text.includes("divorce")) {
      return "Family Disruption";
    }
    return "General Support / Unspecified";
  };

  const traumaCat = doc ? getChildTraumaCategory(doc) : (matched?.profile ? getChildTraumaCategory(matched.profile) : "");
  if (traumaCat) {
    pills.push({ icon: "healing", label: `Trauma: ${traumaCat}` });
  }

  return (
    <div>
      {badge && <div style={{ marginBottom: 12 }}>{badge}</div>}

      <div className="profile-header">
        {photoUrl && !imgFailed ? (
          <img
            className="avatar"
            src={photoUrl}
            alt={name}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="avatar-placeholder">
            <span className="msym" aria-hidden="true">person</span>
          </div>
        )}

        <div className="profile-info">
          {matched?.db_name && matched.db_name !== matched.name && (
            <div className="profile-detail">
              <strong>DB Profile:</strong> {matched.db_name}
            </div>
          )}

          {pills.length > 0 && (
            <div className="pills-row">
              {pills.map((p) => (
                <span className="pill" key={`${p.icon}-${p.label}`}>
                  <span className="msym" aria-hidden="true">{p.icon}</span>
                  {p.label}
                </span>
              ))}
            </div>
          )}

          {strengths && (
            <div className="profile-detail">
              <strong>
                <span className="msym" aria-hidden="true">fitness_center</span>{" "}
                Strengths:
              </strong>{" "}
              {strengths}
            </div>
          )}
          {weakness && (
            <div className="profile-detail">
              <strong>
                <span className="msym" aria-hidden="true">warning</span>{" "}
                Weakness:
              </strong>{" "}
              {weakness}
            </div>
          )}
          {nature && (
            <div className="profile-detail">
              <strong>
                <span className="msym" aria-hidden="true">psychology</span>{" "}
                Nature:
              </strong>{" "}
              {nature}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
