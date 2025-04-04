const { PermissionsBitField } = require('discord.js');

module.exports = {
  /**
   * Verifica se o usuário tem permissão de administrador
   * @param {GuildMember} member - O membro do servidor
   * @returns {boolean}
   */
  isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  },

  /**
   * Verifica se o usuário tem uma permissão específica
   * @param {GuildMember} member - O membro do servidor
   * @param {bigint} permission - A permissão a ser verificada
   * @returns {boolean}
   */
  hasPermission(member, permission) {
    return member.permissions.has(permission);
  },

  /**
   * Verifica se o usuário tem um cargo específico
   * @param {GuildMember} member - O membro do servidor
   * @param {string} roleName - Nome do cargo
   * @returns {boolean}
   */
  hasRole(member, roleName) {
    return member.roles.cache.some(role => role.name === roleName);
  }
};