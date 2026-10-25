using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocaCycle.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAudioSessionTranslationSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IncludeExampleTranslations",
                table: "AudioSessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IncludeWordTranslation",
                table: "AudioSessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IncludeExampleTranslations",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "IncludeWordTranslation",
                table: "AudioSessions");
        }
    }
}
