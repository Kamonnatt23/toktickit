import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [error, setError] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [formData, setFormData] = useState<Partial<User & { initialPassword?: string, newPassword?: string }>>({});
  const [modalError, setModalError] = useState('');

  const fetchUsers = async () => {
    try {
      const query = new URLSearchParams();
      if (search) query.append('search', search);
      if (roleFilter !== 'All') query.append('role', roleFilter);
      
      const res = await api.get(`/admin/users?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data);
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('An error occurred');
    }
  };

  useEffect(() => {
    if (user?.role === 'Administrator') {
      fetchUsers();
    }
  }, [user, search, roleFilter]);

  if (user?.role !== 'Administrator') {
    return <div className="alert alert-danger m-4">Access Denied: Administrators only.</div>;
  }

  const handleOpenCreate = () => {
    setIsResetPassword(false);
    setFormData({ name: '', email: '', role: 'Requester', initialPassword: '', isActive: true });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setIsResetPassword(false);
    setFormData({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenReset = (u: User) => {
    setIsResetPassword(true);
    setFormData({ id: u.id, newPassword: '' });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    try {
      if (isResetPassword) {
        const res = await api.post(`/admin/users/${formData.id}/reset-password`, { newPassword: formData.newPassword });
        if (res.ok) {
          setIsModalOpen(false);
        } else {
          const data = await res.json();
          setModalError(data.error || 'Failed to reset password');
        }
      } else if (formData.id) {
        // Edit
        const res = await api.patch(`/admin/users/${formData.id}`, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          isActive: formData.isActive
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchUsers();
        } else {
          const data = await res.json();
          setModalError(data.error || 'Failed to update user');
        }
      } else {
        // Create
        const res = await api.post('/admin/users', {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          initialPassword: formData.initialPassword,
          isActive: formData.isActive
        });
        if (res.ok) {
          setIsModalOpen(false);
          fetchUsers();
        } else {
          const data = await res.json();
          setModalError(data.error || 'Failed to create user');
        }
      }
    } catch (err) {
      setModalError('An error occurred');
    }
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4" style={{ color: '#006B3C' }}>User Management</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      
      <div className="row mb-3">
        <div className="col-md-5">
          <input 
            type="text" 
            className="form-control" 
            placeholder="Search by name or email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <select 
            className="form-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="All">All Roles</option>
            <option value="Requester">Requester</option>
            <option value="IT Staff">IT Staff</option>
            <option value="Administrator">Administrator</option>
          </select>
        </div>
        <div className="col-md-4 text-end">
          <button 
            className="btn text-white" 
            style={{ backgroundColor: '#006B3C' }} 
            onClick={handleOpenCreate}
          >
            + Create User
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`badge ${u.role === 'Administrator' ? 'bg-danger' : u.role === 'IT Staff' ? 'bg-primary' : 'bg-secondary'}`}>
                    {u.role}
                  </span>
                </td>
                <td>
                  {u.isActive ? (
                    <span className="badge bg-success">Active</span>
                  ) : (
                    <span className="badge bg-dark">Inactive</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => handleOpenEdit(u)}>Edit</button>
                  <button className="btn btn-sm btn-outline-warning" onClick={() => handleOpenReset(u)}>Reset Password</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ color: '#006B3C' }}>
                  {isResetPassword ? 'Reset Password' : formData.id ? 'Edit User' : 'Create User'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setIsModalOpen(false)}></button>
              </div>
              <div className="modal-body">
                {modalError && <div className="alert alert-danger">{modalError}</div>}
                <form onSubmit={handleSave} id="userForm">
                  {isResetPassword ? (
                    <div className="mb-3">
                      <label className="form-label">New Initial Password</label>
                      <input 
                        type="password" 
                        className="form-control" 
                        value={formData.newPassword || ''}
                        onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
                        required
                      />
                    </div>
                  ) : (
                    <>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="nameInput">Name</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          id="nameInput"
                          value={formData.name || ''}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="emailInput">Email</label>
                        <input 
                          type="email" 
                          className="form-control" 
                          id="emailInput"
                          value={formData.email || ''}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="roleSelect">Role</label>
                        <select 
                          className="form-select"
                          id="roleSelect"
                          value={formData.role || 'Requester'}
                          onChange={(e) => setFormData({...formData, role: e.target.value})}
                        >
                          <option value="Requester">Requester</option>
                          <option value="IT Staff">IT Staff</option>
                          <option value="Administrator">Administrator</option>
                        </select>
                      </div>
                      {!formData.id && (
                        <div className="mb-3">
                          <label className="form-label" htmlFor="initialPasswordInput">Initial Password</label>
                          <input 
                            type="password" 
                            className="form-control" 
                            id="initialPasswordInput"
                            value={formData.initialPassword || ''}
                            onChange={(e) => setFormData({...formData, initialPassword: e.target.value})}
                            required
                          />
                        </div>
                      )}
                      <div className="mb-3 form-check">
                        <input 
                          type="checkbox" 
                          className="form-check-input" 
                          id="isActiveCheck"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                        />
                        <label className="form-check-label" htmlFor="isActiveCheck">
                          Active Account
                        </label>
                      </div>
                    </>
                  )}
                </form>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" form="userForm" className="btn text-white" style={{ backgroundColor: '#006B3C' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
