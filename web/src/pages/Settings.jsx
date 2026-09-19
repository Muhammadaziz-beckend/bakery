import { useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import Get from "../utils/routes/get";
import Put from "../utils/routes/put";
import Post from "../utils/routes/post";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import "../static/css/pages/settings.css";

// Организация текущего пользователя — GET/PUT `organization/` берут её из
// request.user.organization на бэкенде (см. OrganizationSettingsView), без
// id в URL, поэтому пользователь физически не может увидеть чужую.
export function Settings() {
  const { token, setOrganization } = Config();

  const [org, setOrg] = useState(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgLoadError, setOrgLoadError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgAddressLink, setOrgAddressLink] = useState("");
  const [orgLogoFile, setOrgLogoFile] = useState(null);
  const [orgLogoPreview, setOrgLogoPreview] = useState(null);
  const [orgRemoveLogo, setOrgRemoveLogo] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSaveError, setOrgSaveError] = useState(null);
  const [orgSaved, setOrgSaved] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setOrgLoading(true);
      setOrgLoadError("");
      const res = await Get("organization/", token);
      if (isApiError(res)) {
        setOrgLoadError(errorMessage(res, "Не удалось загрузить организацию"));
      } else {
        setOrg(res.data);
        setOrgName(res.data.name ?? "");
        setOrgAddress(res.data.address ?? "");
        setOrgAddressLink(res.data.address_link ?? "");
      }
      setOrgLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      setProfileLoading(true);
      setProfileLoadError("");
      const res = await Get("auth/profile/", token);
      if (isApiError(res)) {
        setProfileLoadError(errorMessage(res, "Не удалось загрузить профиль"));
      } else {
        setProfile(res.data);
        setFirstName(res.data.first_name ?? "");
        setLastName(res.data.last_name ?? "");
        setEmail(res.data.email ?? "");
      }
      setProfileLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    return () => {
      if (orgLogoPreview) URL.revokeObjectURL(orgLogoPreview);
    };
  }, [orgLogoPreview]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const orgDisplayLogo = orgRemoveLogo ? null : (orgLogoPreview ?? org?.logo);
  const profileDisplayAvatar = removeAvatar ? null : (avatarPreview ?? profile?.avatar);

  const handleOrgLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (orgLogoPreview) URL.revokeObjectURL(orgLogoPreview);
    setOrgLogoFile(file);
    setOrgLogoPreview(URL.createObjectURL(file));
    setOrgRemoveLogo(false);
    event.target.value = "";
  };

  const handleOrgLogoRemove = () => {
    if (orgLogoPreview) URL.revokeObjectURL(orgLogoPreview);
    setOrgLogoFile(null);
    setOrgLogoPreview(null);
    setOrgRemoveLogo(true);
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
    event.target.value = "";
  };

  const handleAvatarRemove = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
  };

  const isOrgValid = orgName.trim().length > 0 && !orgLoading;

  const handleOrgSubmit = async (event) => {
    event.preventDefault();
    if (!isOrgValid || orgSaving) return;

    setOrgSaving(true);
    setOrgSaveError(null);
    setOrgSaved(false);

    const res = await Put(
      "organization/",
      {
        name: orgName.trim(),
        address: orgAddress.trim(),
        address_link: orgAddressLink.trim(),
      },
      token
    );

    if (isApiError(res)) {
      setOrgSaving(false);
      setOrgSaveError(res);
      return;
    }

    let updatedOrg = res.data;

    // Логотип — отдельный multipart-запрос после сохранения полей организации
    // (тот же приём, что у фото товара — см. ProductFormModal/Product.jsx).
    if (orgLogoFile) {
      const formData = new FormData();
      formData.append("logo", orgLogoFile);
      const logoRes = await Post("organization/logo/", formData, token);
      if (isApiError(logoRes)) {
        alert(errorMessage(logoRes, "Организация сохранена, но логотип загрузить не удалось"));
      } else {
        updatedOrg = { ...updatedOrg, logo: logoRes.data.logo };
      }
    } else if (orgRemoveLogo) {
      const logoRes = await Del("organization/logo/", token);
      if (isApiError(logoRes)) {
        alert(errorMessage(logoRes, "Организация сохранена, но логотип удалить не удалось"));
      } else {
        updatedOrg = { ...updatedOrg, logo: logoRes.data.logo };
      }
    }

    setOrg(updatedOrg);
    setOrgLogoFile(null);
    setOrgLogoPreview(null);
    setOrgRemoveLogo(false);
    setOrgSaving(false);
    setOrgSaved(true);

    // Шапка (Navigation.jsx) читает лого/название организации из
    // localStorage (см. utils/data.jsx) — без этого новое название/лого
    // появились бы в сайдбаре только после перелогина.
    setOrganization({ id: updatedOrg.id, name: updatedOrg.name, logo: updatedOrg.logo });
  };

  const isProfileValid =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !profileLoading;

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (!isProfileValid || profileSaving) return;

    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaved(false);

    const res = await Put(
      "auth/profile/",
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
      },
      token
    );

    if (isApiError(res)) {
      setProfileSaving(false);
      setProfileSaveError(res);
      return;
    }

    let updatedProfile = res.data;

    if (avatarFile) {
      const formData = new FormData();
      formData.append("avatar", avatarFile);
      const avatarRes = await Post("auth/profile/avatar/", formData, token);
      if (isApiError(avatarRes)) {
        alert(errorMessage(avatarRes, "Профиль сохранён, но фото загрузить не удалось"));
      } else {
        updatedProfile = { ...updatedProfile, avatar: avatarRes.data.avatar };
      }
    } else if (removeAvatar) {
      const avatarRes = await Del("auth/profile/avatar/", token);
      if (isApiError(avatarRes)) {
        alert(errorMessage(avatarRes, "Профиль сохранён, но фото удалить не удалось"));
      } else {
        updatedProfile = { ...updatedProfile, avatar: avatarRes.data.avatar };
      }
    }

    setProfile(updatedProfile);
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(false);
    setProfileSaving(false);
    setProfileSaved(true);
  };

  const isPasswordValid =
    oldPassword.length > 0 &&
    newPassword.length > 0 &&
    newPassword === confirmPassword;

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!isPasswordValid || passwordSaving) return;

    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSaved(false);

    const res = await Post(
      "auth/change-password/",
      { old_password: oldPassword, new_password: newPassword },
      token
    );

    setPasswordSaving(false);

    if (isApiError(res)) {
      setPasswordError(res);
      return;
    }

    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaved(true);
  };

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header warehouse_header">
              <h2>Настройки</h2>
            </div>

            <div className="settings_grid">
            <form className="settings_card" onSubmit={handleOrgSubmit}>
              <h3>Организация</h3>
              <p className="settings_card_hint">
                Название, адрес и логотип видны всем сотрудникам вашей организации.
              </p>

              {orgLoadError && <div className="form_error_banner">{orgLoadError}</div>}

              <div className="image_field">
                <div className="image_preview">
                  {orgDisplayLogo ? (
                    <img src={orgDisplayLogo} alt="" />
                  ) : (
                    <span className="image_placeholder">Нет лого</span>
                  )}
                </div>
                <div className="image_actions">
                  <label className="image_upload_btn">
                    {orgDisplayLogo ? "Заменить логотип" : "Загрузить логотип"}
                    <input type="file" accept="image/*" onChange={handleOrgLogoChange} hidden />
                  </label>
                  {orgDisplayLogo && (
                    <button
                      type="button"
                      className="image_remove_btn"
                      onClick={handleOrgLogoRemove}
                    >
                      Удалить логотип
                    </button>
                  )}
                </div>
              </div>

              <label className="field">
                <span className="field_label">Название организации</span>
                <input
                  type="text"
                  placeholder="Напр. Пекарня Хаидар"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  disabled={orgLoading}
                />
              </label>

              <label className="field">
                <span className="field_label">Адрес</span>
                <input
                  type="text"
                  placeholder="Напр. г. Бишкек, ул. Ленина 1"
                  value={orgAddress}
                  onChange={(event) => setOrgAddress(event.target.value)}
                  disabled={orgLoading}
                />
              </label>

              <label className="field">
                <span className="field_label">Ссылка на карту</span>
                <input
                  type="url"
                  placeholder="https://maps.google.com/..."
                  value={orgAddressLink}
                  onChange={(event) => setOrgAddressLink(event.target.value)}
                  disabled={orgLoading}
                />
              </label>

              {orgSaveError && (
                <div className="form_error_banner">
                  {errorMessage(orgSaveError, "Не удалось сохранить организацию")}
                </div>
              )}

              <div className="settings_card_footer">
                {orgSaved && <span className="settings_saved">Сохранено</span>}
                <button
                  type="submit"
                  className="submit_btn"
                  disabled={!isOrgValid || orgSaving}
                >
                  {orgSaving ? "Сохранение…" : "Сохранить организацию"}
                </button>
              </div>
            </form>

            <form className="settings_card" onSubmit={handleProfileSubmit}>
              <h3>Профиль</h3>
              <p className="settings_card_hint">Ваши личные данные для входа в систему.</p>

              {profileLoadError && (
                <div className="form_error_banner">{profileLoadError}</div>
              )}

              <div className="image_field">
                <div className="image_preview">
                  {profileDisplayAvatar ? (
                    <img src={profileDisplayAvatar} alt="" />
                  ) : (
                    <span className="image_placeholder">Нет фото</span>
                  )}
                </div>
                <div className="image_actions">
                  <label className="image_upload_btn">
                    {profileDisplayAvatar ? "Заменить фото" : "Загрузить фото"}
                    <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
                  </label>
                  {profileDisplayAvatar && (
                    <button
                      type="button"
                      className="image_remove_btn"
                      onClick={handleAvatarRemove}
                    >
                      Удалить фото
                    </button>
                  )}
                </div>
              </div>

              <label className="field">
                <span className="field_label">Номер телефона</span>
                <input type="tel" value={profile?.phone ?? ""} disabled />
              </label>

              <div className="field_row">
                <label className="field">
                  <span className="field_label">Имя</span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={profileLoading}
                  />
                </label>

                <label className="field">
                  <span className="field_label">Фамилия</span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    disabled={profileLoading}
                  />
                </label>
              </div>

              <label className="field">
                <span className="field_label">Email</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={profileLoading}
                />
              </label>

              {profileSaveError && (
                <div className="form_error_banner">
                  {errorMessage(profileSaveError, "Не удалось сохранить профиль")}
                </div>
              )}

              <div className="settings_card_footer">
                {profileSaved && <span className="settings_saved">Сохранено</span>}
                <button
                  type="submit"
                  className="submit_btn"
                  disabled={!isProfileValid || profileSaving}
                >
                  {profileSaving ? "Сохранение…" : "Сохранить профиль"}
                </button>
              </div>
            </form>

            <form className="settings_card" onSubmit={handlePasswordSubmit}>
              <h3>Смена пароля</h3>
              <p className="settings_card_hint">
                Чтобы сменить пароль, введите текущий пароль и новый дважды.
              </p>

              <label className="field">
                <span className="field_label">Текущий пароль</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                />
              </label>

              <div className="field_row">
                <label className="field">
                  <span className="field_label">Новый пароль</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="field_label">Повторите новый пароль</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
              </div>

              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <div className="form_error_banner">Пароли не совпадают.</div>
              )}

              {passwordError && (
                <div className="form_error_banner">
                  {errorMessage(passwordError, "Не удалось сменить пароль")}
                </div>
              )}

              <div className="settings_card_footer">
                {passwordSaved && <span className="settings_saved">Пароль изменён</span>}
                <button
                  type="submit"
                  className="submit_btn"
                  disabled={!isPasswordValid || passwordSaving}
                >
                  {passwordSaving ? "Сохранение…" : "Сменить пароль"}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
