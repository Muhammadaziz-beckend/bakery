import { useCallback, useEffect, useState } from "react";
import { Navigation } from "../components/main/Navigation";
import { ClientFormModal } from "../components/pages/ClientFormModal";
import Get from "../utils/routes/get";
import Post from "../utils/routes/post";
import Put from "../utils/routes/put";
import Del from "../utils/routes/del";
import Config from "../utils/data.jsx";
import { errorMessage, isApiError } from "../utils/apiHelpers";
import "../static/css/pages/client.css";

export function Client() {
  const { token } = Config();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [search, setSearch] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Client-list-эндпоинт не пагинирован (как supplier/) — отдаёт весь список сразу.
  const loadClients = useCallback(
    async (searchTerm) => {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : "";
      const res = await Get(`client/${query}`, token);
      if (isApiError(res)) {
        setListError(errorMessage(res, "Не удалось загрузить клиентов"));
        return;
      }
      const data = res.data;
      setItems(Array.isArray(data) ? data : (data?.results ?? []));
    },
    [token]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setListError("");
      await loadClients("");
      setLoading(false);
    })();
  }, [loadClients]);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    await loadClients(search.trim());
    setLoading(false);
  };

  const handleCreate = () => {
    setFormMode("create");
    setEditingItem(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item) => {
    setFormMode("edit");
    setEditingItem(item);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  const handleSubmitForm = async (payload) => {
    setSubmitting(true);
    setFormError(null);

    const res =
      formMode === "edit" && editingItem
        ? await Put(`client/${editingItem.id}/`, payload, token)
        : await Post("client/", payload, token);

    setSubmitting(false);

    if (isApiError(res)) {
      setFormError(res);
      return;
    }

    setIsFormOpen(false);
    await loadClients(search.trim());
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Удалить клиента «${item.name}»?`)) return;

    const res = await Del(`client/${item.id}/`, token);
    if (isApiError(res)) {
      alert(errorMessage(res, "Не удалось удалить клиента"));
      return;
    }

    await loadClients(search.trim());
  };

  return (
    <>
      <Navigation />

      <div className="main">
        <div className="container">
          <div className="main_items">
            <div className="header header_with_action">
              <h2>Клиенты</h2>

              <form className="client_search" onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  placeholder="Поиск по имени, фамилии, телефону…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </form>

              <button type="button" className="btn_create_batch" onClick={handleCreate}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                >
                  <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                </svg>
                Новый клиент
              </button>
            </div>

            {listError && <div className="form_error_banner">{listError}</div>}

            {loading ? (
              <div className="production_journal_loading">Загрузка…</div>
            ) : (
              <div className="client_table">
                <table>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Фамилия</th>
                      <th>Телефон</th>
                      <th>Заказов</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td className="empty" colSpan={5}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id}>
                          <td className="client_name">{item.name}</td>
                          <td>{item.last_name || "—"}</td>
                          <td>{item.tel}</td>
                          <td>{item.orders_count ?? "—"}</td>
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="action_btn edit"
                                onClick={() => handleEdit(item)}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="action_btn delete"
                                onClick={() => handleDelete(item)}
                                aria-label="Удалить"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {isFormOpen && (
        <ClientFormModal
          key={editingItem?.id ?? "create"}
          open={isFormOpen}
          mode={formMode}
          initialValues={editingItem}
          submitting={submitting}
          serverError={formError}
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
        />
      )}
    </>
  );
}
