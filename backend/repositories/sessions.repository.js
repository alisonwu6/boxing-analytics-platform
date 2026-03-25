const sessions = [
  {
    id: "",
    user_id: "",
    title: "",
    session_date: "",
    notes: "",
    created_at: "",
  },
];

async function findAllSessions() {
  return sessions;
}

module.exports = {
  findAllSessions
};