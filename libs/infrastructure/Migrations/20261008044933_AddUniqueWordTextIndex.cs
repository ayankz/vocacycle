using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocaCycle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueWordTextIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Words_Text",
                table: "Words",
                column: "Text",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Words_Text",
                table: "Words");
        }
    }
}
