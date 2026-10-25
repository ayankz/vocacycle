using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocaCycle.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueWordExamplePosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WordExamples_WordId",
                table: "WordExamples");

            migrationBuilder.CreateIndex(
                name: "IX_WordExamples_WordId_Position",
                table: "WordExamples",
                columns: new[] { "WordId", "Position" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WordExamples_WordId_Position",
                table: "WordExamples");

            migrationBuilder.CreateIndex(
                name: "IX_WordExamples_WordId",
                table: "WordExamples",
                column: "WordId");
        }
    }
}
