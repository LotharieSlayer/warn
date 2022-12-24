/**
 * @author Lothaire Guée
 * @description
 *      Contient la commande 'warn'.
 *      Warn un utilisateur.
 */

const { EmbedBuilder } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { getMs } = require(`${process.cwd()}/utils/dateUtils`);
const { getSetupData, warnedUsers, counter } = require("../utils/enmapUtils");
const JSONPenalties = require(`../files/sanctions.json`);

/* ----------------------------------------------- */
/* COMMAND BUILD                                   */
/* ----------------------------------------------- */
let slashCommand = new SlashCommandBuilder()
    .setName("warn")
    .setDescription(
        "[mod] Warn un membre pour son comportement au sein du serveur."
    );

    // Set les warns disponibles dans le JSON
    let warns = [];
    for(let warn in JSONPenalties.enum){
        warns.push({ name: JSONPenalties.enum[warn].name, value: warn });
    }

    slashCommand.addUserOption(user =>
        user
            .setName("user")
            .setDescription("L'utilisateur faisant l'objet de l'avertissement.")
			.setRequired(true)
    );
    
    slashCommand.addStringOption(reason =>
		reason
            .setName('raison')
			.setDescription('La raison de la sanction.')
			.setRequired(true)
			.addChoices(...warns)
    );

    slashCommand.addStringOption(reasonSup =>
        reasonSup
            .setName("raison_supp")
            .setDescription("Raison supplémentaire à ajouter au vu du contexte")
    );

    slashCommand.addStringOption(link =>
		link
            .setName('lien')
			.setDescription('Le lien du message ou de la log qui a value ce warn.')
    );

    slashCommand.setDefaultPermission(false);


const dmEmbed = new EmbedBuilder()
    .setColor(0xffcc4d)
    .setAuthor(
        {name:`Vous venez d'être warn.`, iconURL:"https://i.imgur.com/tuQo0dNh.jpg"}
    )
    .setTimestamp(Date.now());


/* ----------------------------------------------- */
/* FUNCTIONS                                       */
/* ----------------------------------------------- */


async function penalty(member, reason, sanction, reasonS, timeoutBase, interaction){

    // Timeout du membre
    switch (sanction) {
        case "dm":
            if(reasonS === null)
                dmEmbed.setDescription(`Vous avez été warn pour la raison **${reason}**.`)
            else
                dmEmbed.setDescription(`Vous avez été warn pour la raison **${reason}**.\n**Info supplémentaire :** ${reasonS}`)

            try{await member.send({embeds:[dmEmbed]})}
            catch(e){console.log(`Impossible d'envoyer le message de warn à l'utilisateur ${member.user.username} (${member.id})`)}
            break;
        case "kick":
            if(reasonS === null)
                await member.kick(`**Warn :** ${reason}`)
            else
                await member.kick(`**Warn :** ${reason}\n**Info supplémentaire :** ${reasonS}`)
            break;
        case "ban":
            if(reasonS === null)
                await member.ban({reason: `**Warn :** ${reason}`})
            else
                await member.ban({reason: `**Warn :** ${reason}\n**Info supplémentaire :** ${reasonS}`})
            break;
        default:
            // eslint-disable-next-line no-case-declarations
            let timeoutBaseGood = timeoutBase - Date.now();
            if(timeoutBaseGood < 0) timeoutBaseGood = 0;
            if(reasonS === null)
                member.timeout(getMs(sanction) + timeoutBaseGood, `**Warn :** ${reason}`);
            else
                member.timeout(getMs(sanction) + timeoutBaseGood, `**Warn :** ${reason}\n**Info supplémentaire :** ${reasonS}`);
        break;
    }
}



/**
 * Fonction appelé quand la commande est 'warn'
 * @param {CommandInteraction} interaction L'interaction généré par l'exécution de la commande.
 */
async function execute(interaction) {

    for (let i = 0; i < JSONPenalties.sanctions.length; i++) {
        for (let j = 0; j < JSONPenalties.sanctions[i].reasons.length; j++) {
            if(interaction.options.getString("raison") === JSONPenalties.sanctions[i].reasons[j]){
                const reason = JSONPenalties.enum[interaction.options.getString("raison")].name;
                const reasonValue = interaction.options.getString("raison");
                const reasonS = interaction.options.getString("raison_supp");
                const link = interaction.options.getString("lien_msg");
                const member = interaction.options.getMember("user")
                const userDB = await getSetupData(member.id, "warn_user")
                const timeoutBase = member.communicationDisabledUntilTimestamp

                // Incrémentation du compteur
                if(counter.get(`warn_${reasonValue}`) === undefined) counter.set(`warn_${reasonValue}`, 1);
                else counter.set(`warn_${reasonValue}`, counter.get(`warn_${reasonValue}`) + 1);

                // Le cas ou l'utilisateur n'a pas encore été warn / Utilise son intervalle de temps du droit à l'erreur
                if(userDB === undefined){
                    // On set l'utilisateur dans la DB
                    warnedUsers.set(member.id, {sanctions : { [reason] : 0 }, warns:[{reason: reasonValue, reasonS: reasonS, timestamp: Date.now(), link: link, mod: interaction.member.id}], user:{tag: member.user.tag, avatarURL: member.user.avatarURL()}});
                    const userDBNow = await getSetupData(member.id, "warn_user")
                    const sanction = JSONPenalties.sanctions[i].values[userDBNow.sanctions[reason]]
                    
                    penalty(member, reason, sanction, reasonS, timeoutBase, interaction)
                    await interaction.reply({ content: "L'utilisateur n'avait pas encore été warn du tout, il vient d'être enregistré dans la base de données et a été prévenu dans ses DM.", ephemeral: true });
                    return

                }

                // Le cas ou l'utilisateur a déjà été warn

                // Cas ou ce n'était pas cette raison
                // A CORRIGER pcq le lvl 5 quand ils se prennent 24h et bah ça leur met ce dm qui n'est pas le bon aux modos
                if(userDB.sanctions[reason] === undefined){
                    userDB.sanctions[reason] = 0;
                    userDB.warns.push({reason: reasonValue, reasonS: reasonS, timestamp: Date.now(), link: link, mod: interaction.member.id})
                    warnedUsers.set(member.id, userDB);
                    penalty(member, reason, JSONPenalties.sanctions[i].values[userDB.sanctions[reason]], reasonS, timeoutBase, interaction)
                    await interaction.reply({ content: "L'utilisateur n'avait pas encore été warn pour cette sanction, ce dernier a été prévenu dans ses DM ou a reçu une sanction.", ephemeral: true });
                    return
                }

                if(userDB.user === undefined)
                    userDB.user = {tag: member.user.tag, avatarURL: member.user.avatarURL()}

                // On augmente le nombre de raison que l'on update dans la db en remettant l'objet
                userDB.sanctions[reason]++;
                userDB.warns.push({reason: reasonValue, reasonS: reasonS, timestamp: Date.now(), link: link, mod: interaction.member.id})
                warnedUsers.set(member.id, userDB)

                // Si on dépasse la plus grande valeur de timeout du tableau, on le remet à la valeur max
                let nbSanctions = userDB.sanctions[reason];
                if(nbSanctions >= JSONPenalties.sanctions[i].values.length) nbSanctions = JSONPenalties.sanctions[i].values.length - 1;

                const sanction = JSONPenalties.sanctions[i].values[nbSanctions] 

                // On envoie le message à l'utilisateur et on applique le timeout
                
                const nbTimes = userDB.sanctions[reason]+1;
                if(interaction.options.getString("raison_supp") === null)
                    dmEmbed.setDescription(`Vous avez été warn **${nbTimes} fois** pour ${reason}.\nSanction **${sanction}** (j:h:m).`)
                else
                    dmEmbed.setDescription(`Vous avez été warn **${nbTimes} fois** pour ${reason}.\nSanction **${sanction}** (j:h:m).\n**Info supplémentaire :** ${reasonS}`)

                try{await member.send({embeds:[dmEmbed]})}
                catch(e){console.log(`Impossible d'envoyer le message de warn à l'utilisateur ${member.user.username} (${member.id})`)}
                
                penalty(member, reason, sanction, reasonS, timeoutBase, interaction)
                await interaction.reply({ content: `${member.user.username} (${member.id}) a déjà été warn ${nbTimes} fois pour cette sanction "${reason}".\n**Sanction ${sanction} (j:h:m) appliqué.**`, ephemeral: true })
                return
            }
        }
    }
}

/* ----------------------------------------------- */
/* MODULE EXPORTS                                  */
/* ----------------------------------------------- */
module.exports = {
    data: slashCommand,
    execute,
};
