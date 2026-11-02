using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocaCycle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWordPronunciation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DictionaryPronunciation",
                table: "Words",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PronunciationAudioUrl",
                table: "Words",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PronunciationSynthesisAttempted",
                table: "Words",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DictionaryPronunciation",
                table: "Words");

            migrationBuilder.DropColumn(
                name: "PronunciationAudioUrl",
                table: "Words");

            migrationBuilder.DropColumn(
                name: "PronunciationSynthesisAttempted",
                table: "Words");
        }
    }
}
